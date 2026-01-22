import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy, Profile } from "passport-google-oauth20";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser, insertUserSchema, LoginData } from "@shared/schema";
import { z } from "zod";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required")
});

const registerSchema = insertUserSchema.pick({
  username: true,
  password: true,
  email: true
}).extend({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters")
});

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  const isProduction = process.env.NODE_ENV === "production";
  
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "dev-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      secure: isProduction, // Use secure cookies in production
      httpOnly: true,
      sameSite: isProduction ? "none" : "lax", // Allow cross-site in production for Replit proxy
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const normalizedUsername = (username || "").trim().toLowerCase();
        
        // Regular authentication for all users
        const user = await storage.getUserByUsername(normalizedUsername);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false);
        } else {
          return done(null, user);
        }
      } catch (error) {
        return done(error);
      }
    }),
  );

  // Google OAuth Strategy
  const googleCallbackUrl = process.env.GOOGLE_CALLBACK_URL || 
    (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}/auth/google/callback` : 
    "https://neurotext.uk/auth/google/callback");
  
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: googleCallbackUrl,
        },
        async (accessToken: string, refreshToken: string, profile: Profile, done: any) => {
          try {
            const googleId = profile.id;
            const email = profile.emails?.[0]?.value || '';
            const displayName = profile.displayName || email.split('@')[0];

            // Check if user exists by Google ID
            let user = await storage.getUserByGoogleId(googleId);
            
            if (user) {
              // Update last active timestamp
              await storage.updateUserLastActive(user.id);
              return done(null, user);
            }

            // Check if user exists by email (link Google to existing account)
            user = await storage.getUserByEmail(email);
            if (user) {
              // Link Google ID to existing user account
              await storage.linkGoogleToUser(user.id, googleId, displayName);
              await storage.updateUserLastActive(user.id);
              return done(null, user);
            }

            // Create new user
            user = await storage.createGoogleUser(googleId, email, displayName);
            return done(null, user);
          } catch (error) {
            return done(error);
          }
        }
      )
    );
    console.log("[Auth] Google OAuth strategy configured");
  } else {
    console.log("[Auth] Google OAuth not configured - missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
  }

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    const user = await storage.getUser(id);
    done(null, user);
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      // Validate request body
      const validationResult = registerSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: validationResult.error.errors 
        });
      }

      const { password, email } = validationResult.data;
      const normalizedUsername = String(validationResult.data.username || "").trim().toLowerCase();

      const existingUser = await storage.getUserByUsername(normalizedUsername);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const user = await storage.createUser({
        username: normalizedUsername,
        password: await hashPassword(password),
        email: email || undefined,
      });

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(user);
      });
    } catch (error) {
      next(error);
    }
  });

  // Special endpoint removed for security - admin bypass now only in /api/login with env protection

  app.post("/api/login", async (req, res, next) => {
    const normalizedUsername = String(req.body.username || "").trim().toLowerCase();
    req.body.username = normalizedUsername;
    
    // Validate login data
    const validationResult = loginSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        message: "Validation failed", 
        errors: validationResult.error.errors 
      });
    }

    passport.authenticate("local", (err: any, user: any) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ message: "Invalid username or password" });
      }
      req.login(user, (err) => {
        if (err) return next(err);
        res.status(200).json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    // Include total credits in user response
    const totalCredits = await storage.getTotalUserCredits(req.user!.id);
    res.json({
      ...req.user,
      totalCredits
    });
  });

  // Google OAuth routes
  app.get("/auth/google", passport.authenticate("google", { 
    scope: ["profile", "email"] 
  }));

  app.get("/auth/google/callback", 
    passport.authenticate("google", { 
      failureRedirect: "/?login=failed" 
    }),
    (req, res) => {
      console.log("[Auth] Google OAuth callback successful");
      res.redirect("/");
    }
  );

  // Logout route (GET for browser redirects)
  app.get("/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.redirect("/");
    });
  });

  // API endpoint to get user credits
  app.get("/api/credits", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    const totalCredits = await storage.getTotalUserCredits(req.user!.id);
    res.json({ credits: totalCredits });
  });
}