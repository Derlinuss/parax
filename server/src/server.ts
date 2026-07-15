import express from "express";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";
// routelar
import authRoutes from "./routes/auth";
import voiceRoutes from "./routes/voice";
import logRoutes from "./routes/log";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = [
  "https://parax-vqqb.onrender.com",
  "http://localhost:3000",
  process.env.CORS_ORIGIN || "",
].filter(Boolean);

// cors ayarları - render'da sorun çıkarmasın diye
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));
app.use(express.json());

// Express'in arkasındaki proxy'leri güvenilir say (render için)
app.set("trust proxy", 1);

// güvenlik başlıkları (FIXME: bazıları render'da sıkıntı çıkarabiliyor)
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // permission policy - çoğu şeyi kapattık
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), accelerometer=()");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "script-src 'self' https://www.gstatic.com https://unpkg.com 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://webappparax.firebasestorage.app https://api.daily.co wss://*.daily.co",
    "frame-src 'self' https://*.daily.co",
    "img-src 'self' https://webappparax.firebasestorage.app data: blob:",
    "font-src 'self' data:",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "worker-src 'self' blob:"
  ].join("; "));
  next();
});

// public klasöründeki static dosyaları serve et
app.use(express.static(path.join(__dirname, "../../public")));

// api route'ları
app.use("/api/auth", authRoutes);
app.use("/api/voice", voiceRoutes);
app.use("/api/log", logRoutes);

// sayfa route'ları
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