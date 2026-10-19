
import express from "express";
import { createClient } from "@supabase/supabase-js";
import { askDeepSeek } from "./ai.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "20kb" }));
app.use(express.static("public"));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

const supabase =
  supabaseUrl && supabaseSecretKey
    ? createClient(supabaseUrl, supabaseSecretKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      })
    : null;

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "文旅AI职业测评服务器运行正常",
    databaseConfigured: Boolean(supabase)
  });
});

function requireAdmin(req, res, next) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const providedPassword = req.get("x-admin-password");

  if (!adminPassword) {
    return res.status(503).json({
      success: false,
      message: "管理员密码尚未配置"
    });
  }

  if (providedPassword !== adminPassword) {
    return res.status(401).json({
      success: false,
      message: "管理员身份验证失败"
    });
  }

  next();
}


app.get("/api/admin/stats", requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({
        success: false,
        message: "数据库尚未配置完成"
      });
    }

    const { data, error } = await supabase
      .from("assessment_records")
      .select("consent_type, total_score, created_at, job_matches");

    if (error) {
      console.error("读取后台统计失败：", error.message);
      return res.status(500).json({
        success: false,
        message: "读取统计数据失败"
      });
    }

    const records = data || [];

    const identifiedCount = records.filter(
      item => item.consent_type === "identified"
    ).length;

    const anonymousCount = records.filter(
      item => item.consent_type === "anonymous"
    ).length;

    const scores = records
      .map(item => item.total_score)
      .filter(score => Number.isFinite(score));

    const averageScore = scores.length
      ? Math.round(
          scores.reduce((sum, score) => sum + score, 0) /
          scores.length * 10
        ) / 10
      : 0;

    const dailyCounts = {};

    records.forEach(item => {
      if (!item.created_at) return;

      const date = new Date(item.created_at)
        .toISOString()
        .slice(0, 10);

      dailyCounts[date] = (dailyCounts[date] || 0) + 1;
    });

    const dailyTrend = Object.entries(dailyCounts)
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .slice(-7)
      .map(([date, count]) => ({ date, count }));
    
    // 统计各职业方向在匹配结果中的出现次数
    const jobCounts = {};
    const jobScoreTotals = {};

    records.forEach(item => {
      let matches = item.job_matches;

      if (typeof matches === "string") {
        try {
          matches = JSON.parse(matches);
        } catch {
          matches = [];
        }
      }

      if (!Array.isArray(matches)) return;

      matches.forEach(job => {
        if (!job || typeof job.name !== "string" || !job.name.trim()) {
          return;
        }

        const name = job.name.trim();
jobCounts[name] = (jobCounts[name] || 0) + 1;
jobScoreTotals[name] = (jobScoreTotals[name] || 0) + (Number(job.score) || 0);
      });
    });

    const jobDistribution = Object.entries(jobCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
    const jobAverageScores = Object.entries(jobCounts)
  .map(([name, count]) => ({
    name,
    count,
    averageScore: Number((jobScoreTotals[name] / count).toFixed(2))
  }))
  .sort((a, b) => b.averageScore - a.averageScore);

return res.json({
  success: true,
  totalCount: records.length,
  identifiedCount,
  anonymousCount,
  averageScore,
  dailyTrend,
  jobDistribution,
  jobAverageScores
});
  } catch (error) {
    console.error("后台统计接口异常：", error.message);

    return res.status(500).json({
      success: false,
      message: "后台统计接口发生错误"
    });
  }
});
// 导出全部测评记录（CSV，可用 Excel 打开）
app.get("/api/admin/export", requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).send("数据库尚未配置");
    }

    const { data, error } = await supabase
      .from("assessment_records")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("导出测评记录失败：", error.message);
      return res.status(500).send("导出测评记录失败");
    }

    const records = data || [];
    const columns = [
      "id",
      "created_at",
      "consent_type",
      "total_score",
      "dimension_scores",
      "job_matches",
      "ai_analysis"
    ];

    const escapeCsv = (value) => {
      if (value === null || value === undefined) return '""';

      const text = typeof value === "object"
        ? JSON.stringify(value)
        : String(value);

      return '"' + text.replace(/"/g, '""') + '"';
    };

    const rows = [
      columns.map(escapeCsv).join(","),
      ...records.map(record =>
        columns.map(column => escapeCsv(record[column])).join(",")
      )
    ];

    const csv = "\uFEFF" + rows.join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="assessment_records.csv"'
    );

    return res.send(csv);
  } catch (error) {
    console.error("导出接口异常：", error.message);
    return res.status(500).send("导出接口发生错误");
  }
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

app.post("/api/assessment-records", async (req, res) => {
  try {
    const {
      consentType,
      consent,
      participantName,
      studentId,
      answers,
      totalScore,
      dimensionScores,
      jobMatches,
      aiAnalysis,
      intendedJobs
    } = req.body ?? {};

    // 未授权：不保存测评记录
    if (consent !== true || consentType === "none") {
      return res.json({
        success: true,
        saved: false,
        message: "未授权，不保存测评记录"
      });
    }

    if (!supabase) {
      return res.status(503).json({
        success: false,
        message: "数据库尚未配置完成"
      });
    }

    if (
      !["identified", "anonymous"].includes(consentType) ||
      !Array.isArray(answers) ||
      !Number.isFinite(totalScore) ||
      !dimensionScores ||
      typeof dimensionScores !== "object" ||
      !Array.isArray(jobMatches) ||
      typeof aiAnalysis !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "测评记录格式不正确"
      });
    }

    let record;

    if (consentType === "identified") {
      if (
        typeof participantName !== "string" ||
        !participantName.trim() ||
        typeof studentId !== "string" ||
        !studentId.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: "实名授权需要填写姓名和学号"
        });
      }

      record = {
        consent_type: "identified",
        participant_name: participantName.trim().slice(0, 100),
        student_id: studentId.trim().slice(0, 100),
        answers,
        total_score: totalScore,
        dimension_scores: dimensionScores,
        job_matches: jobMatches,
        intended_jobs: Array.isArray(intendedJobs) ? intendedJobs : [],
        ai_analysis: aiAnalysis.slice(0, 12000),
        consent_at: new Date().toISOString()
      };
    } else {
      // 匿名记录只保存统计所需数据，不保存姓名、学号或原始答案
      record = {
        consent_type: "anonymous",
        participant_name: "匿名",
        answers: [],
        total_score: totalScore,
        dimension_scores: dimensionScores,
        job_matches: [],
        intended_jobs: Array.isArray(intendedJobs) ? intendedJobs : [],
        ai_analysis: "",
        consent_at: new Date().toISOString()
      };
    }

    const { error } = await supabase
      .from("assessment_records")
      .insert(record);

    if (error) {
      console.error("保存测评记录失败：", error.message);

      return res.status(500).json({
        success: false,
        message: "测评记录保存失败，请稍后重试"
      });
    }

    return res.json({
      success: true,
      saved: true,
      consentType
    });
  } catch (error) {
    console.error("测评记录接口异常：", error.message);

    return res.status(500).json({
      success: false,
      message: "处理测评记录时发生错误"
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`服务器已启动，端口：${PORT}`);
});
