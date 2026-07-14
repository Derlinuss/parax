import express from "express";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";
import authRoutes from "./routes/auth";
import voiceRoutes from "./routes/voice";
import logRoutes from "./routes/log";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "../../public")));

app.use("/api/auth", authRoutes);
app.use("/api/voice", voiceRoutes);
app.use("/api/log", logRoutes);

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "../../public/index.html"));
});

app.get("/login", (_req, res) => {
  res.sendFile(path.join(__dirname, "../../public/login.html"));
});

app.get("/signup", (_req, res) => {
  res.sendFile(path.join(__dirname, "../../public/signup.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});