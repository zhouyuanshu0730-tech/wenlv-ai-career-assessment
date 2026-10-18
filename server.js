
import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "文旅AI职业测评服务器运行正常"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`服务器已启动，端口：${PORT}`);
});
