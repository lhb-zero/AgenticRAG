"""打分器 Prompt - 文档相关性评估 & 幻觉检测"""

# ── 文档相关性打分 ──
DOC_GRADER_PROMPT = """你是一个严格的企业文档相关性评估器。请根据用户问题判断以下文档是否相关。

用户问题:
{query}

文档内容:
{document}

请判断该文档与用户问题的相关性，给出以下三个等级之一:
- relevant: 文档与问题直接相关，包含回答所需的关键信息
- partial: 文档部分相关，包含一些背景信息但不足以完整回答问题
- irrelevant: 文档与问题无关，不包含任何有用信息

请以 JSON 格式输出你的判断，格式如下:
{{"grade": "relevant|partial|irrelevant", "reason": "简洁说明判断理由"}}

只输出 JSON，不要输出任何其他内容。"""

# ── 答案忠实度 / 幻觉检测 ──
HALLUCINATION_GRADER_PROMPT = """你是一个严格的事实核查员。请判断以下生成的答案是否完全基于提供的文档内容，是否存在编造或幻觉。

生成的答案:
{answer}

参考文档集合:
{documents}

请判断答案的忠实度:
- faithful: 答案中的所有事实陈述都能在文档中找到依据
- hallucinated: 答案中包含无法在文档中验证的编造信息

请以 JSON 格式输出你的判断:
{{"grade": "faithful|hallucinated", "reason": "简洁说明判断理由", "hallucinated_parts": ["列出编造的具体内容片段"]}}

只输出 JSON，不要输出任何其他内容。"""