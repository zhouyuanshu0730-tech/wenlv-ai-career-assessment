
export async function askDeepSeek(prompt) {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error("服务器尚未配置 DeepSeek API Key");
  }

  const response = await fetch(
    "https://api.deepseek.com/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: "你是一名专业的文旅职业发展分析助手。请依据提供的测评数据进行客观、清晰的职业分析，不要编造用户未提供的信息。"
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1200,
        stream: false
      })
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    console.error("DeepSeek API 调用失败：", response.status, detail);
    throw new Error(`DeepSeek API 请求失败，状态码：${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}
