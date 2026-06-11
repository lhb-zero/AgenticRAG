"""沙箱测试 - 使用原生 http.client 验证完整 HITL 流程"""
import json
import http.client
import time

BASE_HOST = "localhost"
BASE_PORT = 8000
THREAD_ID = f"sandbox-{int(time.time())}"


def test_health():
    """测试健康检查"""
    print("=" * 60)
    print("[TEST 0] 健康检查")
    conn = http.client.HTTPConnection(BASE_HOST, BASE_PORT, timeout=5)
    conn.request("GET", "/health")
    r = conn.getresponse()
    body = r.read().decode()
    print(f"  Status: {r.status}")
    print(f"  Body: {body}")
    conn.close()


def test_sse():
    """测试 POST /api/chat - SSE 流式响应"""
    print("=" * 60)
    print(f"[TEST 1] SSE 流式响应 (thread={THREAD_ID})")
    print("=" * 60)

    body = json.dumps({
        "query": "LangGraph 中的 Checkpointer 有什么作用？",
        "thread_id": THREAD_ID,
    })

    conn = http.client.HTTPConnection(BASE_HOST, BASE_PORT, timeout=120)
    conn.request(
        "POST", "/api/chat",
        body=body,
        headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
    )
    r = conn.getresponse()
    print(f"  Status: {r.status}")
    print(f"  Content-Type: {r.headers.get('Content-Type', 'N/A')}")

    events = []
    buffer = ""
    current_event = ""

    # Read raw bytes in a loop
    try:
        while True:
            chunk = r.read(4096)
            if not chunk:
                print("  (connection closed)")
                break

            decoded = chunk.decode("utf-8", errors="replace")
            buffer += decoded

            # Parse SSE messages
            while "\n\n" in buffer:
                msg, buffer = buffer.split("\n\n", 1)
                for line in msg.split("\n"):
                    if line.startswith("event: "):
                        current_event = line[7:].strip()
                    elif line.startswith("data: "):
                        try:
                            data = json.loads(line[6:])
                            events.append({"event": current_event, "data": data})
                            ns = data.get("node_status", "N/A")
                            print(f"  -> event={current_event} node_status={ns}")
                            if data.get("outline"):
                                print(f"     outline: {data['outline'][:150]}...")
                            if data.get("draft_answer"):
                                print(f"     draft: {data['draft_answer'][:150]}...")
                            if data.get("error"):
                                print(f"     ERROR: {data['error']}")
                        except json.JSONDecodeError as e:
                            print(f"  -> parse error: {e}")
    except Exception as e:
        print(f"  -> read error: {e}")

    conn.close()
    print(f"\n  Total events: {len(events)}\n")
    return events


def test_review(stage, decision, feedback=""):
    """测试 POST /api/review"""
    label = f"审核({stage}/{decision})"
    print(f"[TEST] {label}")

    body = json.dumps({
        "thread_id": THREAD_ID,
        "stage": stage,
        "decision": decision,
        "feedback": feedback,
    })

    conn = http.client.HTTPConnection(BASE_HOST, BASE_PORT, timeout=120)
    conn.request(
        "POST", "/api/review",
        body=body,
        headers={"Content-Type": "application/json"},
    )
    r = conn.getresponse()
    raw = r.read().decode()
    conn.close()

    result = json.loads(raw)
    print(f"  Status: {r.status}")
    print(f"  success: {result.get('success')}")
    print(f"  node_status: {result.get('node_status')}")
    print(f"  message: {result.get('message')}")

    data = result.get("data", {})
    for k, v in data.items():
        if v and isinstance(v, str) and len(v) > 150:
            print(f"  {k}: {v[:150]}...")
        else:
            print(f"  {k}: {v}")

    print()
    return result


def test_history():
    """测试历史查询"""
    print("[TEST] 历史查询")

    conn = http.client.HTTPConnection(BASE_HOST, BASE_PORT, timeout=10)
    conn.request("GET", f"/api/history/{THREAD_ID}")
    r = conn.getresponse()
    raw = r.read().decode()
    conn.close()

    result = json.loads(raw)
    print(f"  node_status: {result.get('node_status')}")
    print(f"  exists: {result.get('exists')}")
    print(f"  has_interrupt: {result.get('has_interrupt')}")
    print(f"  has_outline: {bool(result.get('outline'))}")
    print(f"  has_draft: {bool(result.get('draft_answer'))}")
    print()
    return result


if __name__ == "__main__":
    # Step 0: 健康检查
    test_health()

    # Step 1: 发送查询，等待 SSE
    events = test_sse()

    if not events:
        print(">>> 未收到任何SSE事件，后端可能崩溃")
        exit(1)

    # Step 2: 判断当前阶段
    last_ns = events[-1]["data"].get("node_status", "unknown")

    if last_ns == "error":
        print(f">>> 查询出错: {events[-1]['data'].get('error')}")
        exit(1)

    if last_ns == "outline_review":
        print(">>> 进入 HITL 大纲确认阶段")

        # Step 3: 审批大纲
        result2 = test_review("outline", "approve")

        if result2.get("node_status") == "answer_review":
            print(">>> 进入 HITL 答案确认阶段")

            # Step 4: 审批答案
            result3 = test_review("answer", "approve")

            if result3.get("node_status") == "done":
                print(">>> 流程完成！最终答案已确认")
            else:
                print(f">>> 意外状态: {result3.get('node_status')}")
        else:
            print(f">>> 大纲审批后状态: {result2.get('node_status')}")
    elif last_ns == "done":
        print(">>> 直接完成 (可能之前已审批过)")
    else:
        print(f">>> 未进入HITL阶段，当前状态: {last_ns}")

    # Step 5: 最终历史
    test_history()

    print("=" * 60)
    print("测试完成!")
    print("=" * 60)