
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const multer = require("multer");
const dns = require("node:dns");

// Keep this for environments where the default DNS resolver has issues.
dns.setServers(["1.1.1.1", "8.8.8.8"]);

const app = express();
const PORT = process.env.PORT || 5000;
const IS_VERCEL = Boolean(process.env.VERCEL);
const publicDir = path.join(__dirname, "public");

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Serve frontend assets from public/.
app.use(express.static(publicDir));

// =====================================================
// TRAILER UPLOAD
// Local development supports disk uploads.
// Vercel production temporarily disables local uploads.
// Use cloud object storage for permanent production uploads.
// =====================================================

const trailerDir = path.join(__dirname, "public", "uploads", "trailers");

// Vercel deployment filesystem par upload directory create mat karo.
if (!process.env.VERCEL) {
  fs.mkdirSync(trailerDir, { recursive: true });
}

const localTrailerUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, trailerDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(
        null,
        `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`
      );
    }
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^video\/(mp4|webm|ogg|quicktime|x-msvideo)$/.test(file.mimetype)) {
      return cb(null, true);
    }
    cb(new Error("Please upload a video file (MP4, WebM, OGG, MOV or AVI)."));
  }
});

// Never write uploaded files to the Vercel deployment filesystem.
const trailerUpload = IS_VERCEL
  ? (req, res, next) => {
      if (req.headers["content-type"]?.includes("multipart/form-data")) {
        return res.status(501).json({
          error:
            "Trailer file uploads are not enabled on Vercel yet. " +
            "Use a hosted trailer URL until cloud storage is configured."
        });
      }
      next();
    }
  : localTrailerUpload.single("trailerFile");


const movieSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  year: { type: Number, default: 2024 },
  genre: { type: String, default: "Drama" },
  rating: { type: Number, default: 4.0, min: 0, max: 5 },
  description: { type: String, default: "" },
  poster: { type: String, default: "" },
  language: { type: String, default: "Hindi" },
  director: { type: String, default: "" },
  cast: { type: String, default: "" },
  trailerUrl: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});

movieSchema.index({ title: "text", genre: 1 });

const Movie = mongoose.model("Movie", movieSchema, "movies");

// =====================================================
// DEMO MOVIES — used only when MongoDB is disconnected
// =====================================================

const demoMovies = [
  {
    _id: "demo1",
    title: "Interstellar",
    year: 2014,
    genre: "Sci-Fi",
    rating: 4.8,
    language: "English",
    description: "A team of explorers travel beyond this galaxy to discover whether mankind has a future among the stars.",
    poster: "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg"
  },
  {
    _id: "demo2",
    title: "Inception",
    year: 2010,
    genre: "Thriller",
    rating: 4.7,
    language: "English",
    description: "A skilled thief enters dreams to steal secrets, but his toughest mission is planting an idea.",
    poster: "https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg"
  },
  {
    _id: "demo3",
    title: "3 Idiots",
    year: 2009,
    genre: "Comedy",
    rating: 4.8,
    language: "Hindi",
    description: "Three engineering students discover friendship, purpose and the courage to follow their passion.",
    poster: "https://image.tmdb.org/t/p/w500/66A9MqXOyVFCssoloscw79z8Tew.jpg"
  },
  {
    _id: "demo4",
    title: "Dangal",
    year: 2016,
    genre: "Drama",
    rating: 4.6,
    language: "Hindi",
    description: "A former wrestler trains his daughters to become world-class wrestlers against every expectation.",
    poster: "https://image.tmdb.org/t/p/w500/whEM7qjV3e2jW9b6n7f4lV4v1rK.jpg"
  },
  {
    _id: "demo5",
    title: "The Dark Knight",
    year: 2008,
    genre: "Action",
    rating: 4.9,
    language: "English",
    description: "Batman faces a criminal mastermind who pushes Gotham into chaos and tests its limits.",
    poster: "https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg"
  },
  {
    _id: "demo6",
    title: "Zindagi Na Milegi Dobara",
    year: 2011,
    genre: "Drama",
    rating: 4.5,
    language: "Hindi",
    description: "Three friends take a road trip across Spain that changes how they see life and each other.",
    poster: "https://image.tmdb.org/t/p/w500/1W1W7Er6a9D9fK3Qf5fXv3mXwQ.jpg"
  },
  {
    _id: "demo7",
    title: "Spider-Man: Into the Spider-Verse",
    year: 2018,
    genre: "Animation",
    rating: 4.7,
    language: "English",
    description: "Miles Morales discovers that anyone can wear the mask in a dazzling multiverse adventure.",
    poster: "https://image.tmdb.org/t/p/w500/iiZZdoQBEYBv6id8su7ImL0oCbD.jpg"
  },
  {
    _id: "demo8",
    title: "Drishyam",
    year: 2015,
    genre: "Thriller",
    rating: 4.5,
    language: "Hindi",
    description: "A resourceful family man uses his love of cinema and sharp instincts to protect his family.",
    poster: "https://image.tmdb.org/t/p/w500/6s6j6f6f6f6f6f6f6f6f6f6f6f6.jpg"
  }
];

// =====================================================
// USER MODEL
// =====================================================

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["user"], default: "user" },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);

// =====================================================
// AUTHENTICATION HELPERS
// =====================================================

const tokenSecret =
  process.env.TOKEN_SECRET ||
  "change-this-token-secret-before-deployment-please";

function signToken(payload) {
  const body = Buffer.from(
    JSON.stringify({
      ...payload,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000
    })
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", tokenSecret)
    .update(body)
    .digest("base64url");

  return `${body}.${signature}`;
}

function verifyToken(token) {
  try {
    const [body, signature] = String(token || "").split(".");
    if (!body || !signature) return null;

    const expected = crypto
      .createHmac("sha256", tokenSecret)
      .update(body)
      .digest();

    const actual = Buffer.from(signature, "base64url");

    if (
      actual.length !== expected.length ||
      !crypto.timingSafeEqual(expected, actual)
    ) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    );

    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const token = (req.headers.authorization || "").replace(
    /^Bearer\s+/i,
    ""
  );

  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ error: "Please log in first." });
  }

  req.auth = payload;
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.auth.role !== "admin") {
      return res.status(403).json({ error: "Admin access required." });
    }
    next();
  });
}

function passwordHash(
  password,
  salt = crypto.randomBytes(16).toString("hex")
) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function passwordMatches(password, stored) {
  try {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;

    const expected = Buffer.from(hash, "hex");
    const actual = crypto.scryptSync(password, salt, 64);

    return (
      expected.length === actual.length &&
      crypto.timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}

function safeEqualStrings(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));

  return (
    aa.length === bb.length &&
    crypto.timingSafeEqual(aa, bb)
  );
}

// =====================================================
// REGISTER
// =====================================================

app.post("/api/auth/register", async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: "Connect MongoDB before registering."
    });
  }

  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (name.length < 2 || name.length > 80) {
    return res.status(400).json({
      error: "Name must be 2–80 characters."
    });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      error: "Enter a valid email address."
    });
  }

  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({
      error: "Password must be at least 8 characters."
    });
  }

  try {
    const user = await User.create({
      name,
      email,
      passwordHash: passwordHash(password)
    });

    const token = signToken({
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: "user"
    });

    res.status(201).json({
      token,
      user: {
        name: user.name,
        email: user.email,
        role: "user"
      }
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        error: "An account with this email already exists."
      });
    }

    console.error("Registration error:", err);
    res.status(500).json({ error: "Could not create account." });
  }
});

// =====================================================
// LOGIN
// =====================================================

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  const adminEmail = String(process.env.ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();

  const adminPassword = String(process.env.ADMIN_PASSWORD || "");

  if (
    adminEmail &&
    adminPassword &&
    safeEqualStrings(email, adminEmail) &&
    safeEqualStrings(password, adminPassword)
  ) {
    const token = signToken({
      id: "admin",
      name: "Administrator",
      email: adminEmail,
      role: "admin"
    });

    return res.json({
      token,
      user: {
        name: "Administrator",
        email: adminEmail,
        role: "admin"
      }
    });
  }

  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: "Connect MongoDB before user login."
    });
  }

  try {
    const user = await User.findOne({ email });

    if (!user || !passwordMatches(password, user.passwordHash)) {
      return res.status(401).json({
        error: "Invalid email or password."
      });
    }

    const token = signToken({
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: "user"
    });

    res.json({
      token,
      user: {
        name: user.name,
        email: user.email,
        role: "user"
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Could not log in." });
  }
});

// =====================================================
// CURRENT USER
// =====================================================

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({
    user: {
      name: req.auth.name,
      email: req.auth.email,
      role: req.auth.role
    }
  });
});

// =====================================================
// DATABASE HEALTH CHECK
// =====================================================

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    databaseName: mongoose.connection.name || null,
    moviesCollection: Movie.collection.name
  });
});

// =====================================================
// GET MOVIES
// =====================================================

app.get("/api/movies", async (req, res) => {
  try {
    const {
      search = "",
      genre = "All",
      sort = "recommended"
    } = req.query;

    if (mongoose.connection.readyState !== 1) {
      let result = demoMovies.filter((movie) => {
        const searchableText =
          `${movie.title} ${movie.genre} ${movie.language}`.toLowerCase();

        return (
          searchableText.includes(String(search).toLowerCase()) &&
          (genre === "All" || movie.genre === genre)
        );
      });

      if (sort === "rating") result.sort((a, b) => b.rating - a.rating);
      if (sort === "year") result.sort((a, b) => b.year - a.year);

      return res.json(result);
    }

    const filter = {};

    if (genre && genre !== "All") {
      filter.genre = genre;
    }

    if (search) {
      const safeSearch = String(search).slice(0, 100);
      const escapedSearch = safeSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      filter.$or = [
        { title: { $regex: escapedSearch, $options: "i" } },
        { genre: { $regex: escapedSearch, $options: "i" } },
        { language: { $regex: escapedSearch, $options: "i" } }
      ];
    }

    let query = Movie.find(filter);

    if (sort === "rating") {
      query = query.sort({ rating: -1 });
    } else if (sort === "year") {
      query = query.sort({ year: -1 });
    } else {
      query = query.sort({ createdAt: -1 });
    }

    const movies = await query.limit(100).lean();

    console.log("MongoDB database:", mongoose.connection.name);
    console.log("MongoDB collection:", Movie.collection.name);
    console.log("Movies found:", movies.length);

    res.json(movies);
  } catch (err) {
    console.error("GET /api/movies error:", err);
    res.status(500).json({ error: "Could not load movies." });
  }
});

// =====================================================
// ADD MOVIE (ADMIN)
// =====================================================

app.post(
  "/api/movies",
  requireAdmin,
  trailerUpload,
  async (req, res) => {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        error: "Connect MongoDB first to save movies."
      });
    }

    try {
      const {
        title,
        year,
        genre,
        rating,
        description,
        poster,
        language,
        director,
        cast,
        trailerUrl
      } = req.body;

      if (!String(title || "").trim()) {
        return res.status(400).json({
          error: "Movie title is required."
        });
      }

      // Local upload is supported only outside Vercel.
      const savedTrailerUrl = req.file
        ? `/uploads/trailers/${req.file.filename}`
        : String(trailerUrl || "").trim();

      const movie = await Movie.create({
        title,
        year,
        genre,
        rating,
        description,
        poster,
        language,
        director,
        cast,
        trailerUrl: savedTrailerUrl
      });

      res.status(201).json(movie);
    } catch (err) {
      console.error("Add movie error:", err);
      res.status(400).json({
        error: err.message || "Invalid movie details."
      });
    }
  }
);

// =====================================================
// UPDATE MOVIE RATING
// =====================================================

app.patch("/api/movies/:id/rating", requireAuth, async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: "Ratings can be saved after MongoDB is connected."
    });
  }

  try {
    const rating = Number(req.body.rating);

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({
        error: "Rating must be between 1 and 5."
      });
    }

    const movie = await Movie.findByIdAndUpdate(
      req.params.id,
      { rating },
      { new: true, runValidators: true }
    );

    if (!movie) {
      return res.status(404).json({ error: "Movie not found." });
    }

    res.json(movie);
  } catch (err) {
    console.error("Update rating error:", err);
    res.status(400).json({
      error:
        "Could not update rating. Demo cards cannot be rated until movies are stored in MongoDB."
    });
  }
});

// =====================================================
// ERROR HANDLER
// =====================================================

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "Trailer is too large. Maximum size is 100 MB."
        : err.message;

    return res.status(400).json({ error: message });
  }

  if (err && /Please upload a video file/.test(err.message || "")) {
    return res.status(400).json({ error: err.message });
  }

  console.error("Unhandled server error:", err);

  if (res.headersSent) return next(err);

  res.status(500).json({
    error: "An unexpected server error occurred."
  });
});

// =====================================================
// HOMEPAGE
// Avoid a catch-all route that may mask missing files.
// Static assets and existing HTML files are served by express.static.
// =====================================================

app.get("/", (req, res) => {
  const indexPath = path.join(publicDir, "index.html");

  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error("Homepage file error:", err);
      if (!res.headersSent) {
        res.status(500).send("Homepage file could not be loaded.");
      }
    }
  });
});

// =====================================================
// NOT FOUND
// =====================================================

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "API endpoint not found." });
  }

  res.status(404).send("Page not found.");
});

// =====================================================
// START SERVER
// =====================================================

async function start() {
  if (process.env.MONGODB_URI) {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 10000
      });

      console.log("MongoDB connected");
      console.log("Database:", mongoose.connection.name);
      console.log("Movies collection:", Movie.collection.name);
      console.log("Movies stored:", await Movie.countDocuments());
    } catch (err) {
      console.error("MongoDB connection failed:", err.message);
      console.error("Error name:", err.name);

      if (err.reason?.servers) {
        for (const [address, server] of err.reason.servers) {
          console.error("MongoDB server:", address);
          console.error(
            "Server error:",
            server.error?.message || "No specific error"
          );
        }
      }

      console.error("Server is starting without MongoDB.");
    }
  } else {
    console.warn("MONGODB_URI is not set.");
  }

  // Vercel manages the HTTP server for its deployment.
  // For local development, start listening on PORT.
  if (!IS_VERCEL) {
    app.listen(PORT, () => {
      console.log(`MovieFlix running at http://localhost:${PORT}`);
    });
  }
}

// Export the Express app for Vercel's serverless runtime.
module.exports = app;

// Start the connection for both local and Vercel deployments.
start().catch((err) => {
  console.error("Application startup error:", err);
  if (!IS_VERCEL) process.exitCode = 1;
});
