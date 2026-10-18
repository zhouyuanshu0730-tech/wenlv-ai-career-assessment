
import express from "express";
import { askDeepSeek } from "./ai.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "20kb" }));
app.use(express.static("public"));

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "文旅AI职业测评服务器运行正常"
  });
});

app.post("/api/ai-test", async (req, res) => {
  try {
    const prompt = req.body?.prompt;

    if (
      typeof prompt !== "string" ||
      prompt.trim().length === 0 ||
      prompt.length > 4000
    ) {
      return res.status(400).json({
        success: false,
        message: "请输入有效的测试内容，最多4000个字符"
      });
    }

    const result = await askDeepSeek(prompt.trim());

    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error("AI接口异常：", error.message);

    res.status(502).json({
      success: false,
      message: "AI分析暂时不可用，请稍后重试"
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`服务器已启动，端口：${PORT}`);
});
