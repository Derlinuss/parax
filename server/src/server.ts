import express from "express";
import cors from "cors";
import path from "path";
import authRoutes from "./routes/auth";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "../../")));

app.use("/api/auth", authRoutes);

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "../../index.html"));
});

app.get("/login", (_req, res) => {
  res.sendFile(path.join(__dirname, "../../login.html"));
});

app.get("/signup", (_req, res) => {
  res.sendFile(path.join(__dirname, "../../signup.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});