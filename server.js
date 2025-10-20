/* Oumaima Bouzidi - boou24cg@student.ju.se
Layla Abdullahi - abla24rh@student.ju.se

Target grade: 5

Project Web Dev Fun - 2025

Administrator login: admin
Administrator password: wdf#2025 ----> $2b$12$g5HuOX7zVUh.95k4sl6ifeXN/jrxsG0RX8wp3amk8/Yt8miAIC2yu

- Some code in this project was written, corrected (bugs) with the help of chatGPT!
- ALL of our recipe images come from google images. 

You can log in using the accounts user1 to user9, each with their 
corresponding password pw1 to pw9 (e.g., user1/pw1, user2/pw2, …, user9/pw9).

When logged in as an admin, you have full CRUD (Create, Read, Update, Delete) permissions for the images
(see detailed recipes page on the detailed recipe pages), as well as access to modify the users table (CRUD)
 (see users button on the navbar when logged in as admin)
  
  • When logged in as an Admin you have full access to do all of the Crud (both on the images & modify users table).
	•	When logged in as a regular user, you have CRUD permissions limited to the images only.
	•	When using the website as a visitor, you can freely browse all recipes and categories, but without editing access.

  PORT: http://localhost:3003

*/

//  IMPORTS
const path = require("path");
const express = require("express");
const exphbs = require("express-handlebars");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const fs = require("fs/promises");
const multer = require("multer");
const session = require("express-session");
const connectSqlite3 = require("connect-sqlite3");

//  APP + DB FILE
const app = express();
const PORT = 3003;
const DB_FILE = path.join(__dirname, "recipe.sqlite3.db");

// login constants (DB already stores hashed passwords)
const PW_COL = "password_hash";

//  STATIC + PARSER
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

//  HANDLEBARS
app.engine(
  "handlebars",
  exphbs.engine({
    defaultLayout: "main",
    helpers: {
      eq(a, b) {
        return a == b;
      },
    },
  })
);
app.set("view engine", "handlebars");
app.set("views", path.join(__dirname, "views"));

//  SQLITE OPEN
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error("Could not open the database file:", err);
  } else {
    console.log("Connected to database:", DB_FILE);
    db.run("PRAGMA foreign_keys = ON");
  }
});

//  SESSIONS (store in sqlite)
const SQLiteStore = connectSqlite3(session);
app.use(
  session({
    store: new SQLiteStore({ db: "session-db.db" }),
    saveUninitialized: false,
    resave: false,
    secret: "This123Is@Another#456GreatSecret678%Sentence",
  })
);

// make session available in every template as {{session}}
app.use((req, res, next) => {
  res.locals.session = req.session;
  next();
});

//  AUTH MIDDLEWARE
function requireLogin(req, res, next) {
  if (req.session?.isLoggedIn) return next();
  return res.status(401).render("login", {
    title: "Login",
    heading: "Log in",
    error: "Please log in to continue.",
  });
}

function requireAdmin(req, res, next) {
  if (req.session?.isAdmin) return next();
  return res.status(403).render("login", {
    title: "Login",
    heading: "Log in",
    error: "Admin access required.",
  });
}

//  MULTER
// Files go to /public/img ; DB stores "/img/<random>.ext"
const UPLOADS_DIR = path.join(__dirname, "public", "img");

// ensure folder exists
(async () => {
  try {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  } catch {}
})();

// random name, keep original extension
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || ".jpg").toLowerCase();
    const rnd = Math.random().toString(36).slice(2, 10);
    cb(null, rnd + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const ok = ["image/png", "image/jpeg"].includes(file.mimetype);
    cb(ok ? null : new Error("Only PNG or JPG allowed"), ok);
  },
});

//  ROUTES

// Home
app.get("/", (req, res) => {
  res.render("home", { title: "Home" });
});

// About
app.get("/about", (req, res) => {
  res.render("about", { title: "About" });
});
//contact
app.get("/contact", (req, res) => {
  res.render("contact", { title: "contact" });
});

// Login (page)
app.get("/login", (req, res) => {
  res.render("login", { title: "Login Form", heading: "Log in" });
});

// Login (process): any user from DB; mark admin if username === 'admin'
app.post("/login", (req, res) => {
  const { un, pw } = req.body;

  const sql = `
    SELECT id, username, ${PW_COL} AS password_hash
    FROM users
    WHERE username = ?
    LIMIT 1
  `;
  db.get(sql, [un], (err, row) => {
    if (err) {
      console.error("Login DB error:", err);
      return res.status(500).send("Database error.");
    }
    if (!row) {
      return res.render("login", {
        title: "Login Form",
        heading: "Log in",
        error: "Wrong Username or Password",
        un,
      });
    }

    bcrypt.compare(pw, row.password_hash, (cmpErr, ok) => {
      if (cmpErr || !ok) {
        return res.render("login", {
          title: "Login Form",
          heading: "Log in",
          error: "Wrong Username or Password",
          un,
        });
      }
      // success → create session flags
      req.session.isLoggedIn = true;
      req.session.userId = row.id;
      req.session.username = row.username;
      req.session.isAdmin = row.username === "admin";

      // redirect to HOME (as you asked)
      return res.redirect("/");
    });
  });
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// Categories: list each category + optional example recipe
app.get("/categories", (req, res) => {
  const sqlCategories = `
    SELECT id, name, description
    FROM categories
    ORDER BY name ASC
  `;
  db.all(sqlCategories, [], (err, categories) => {
    if (err) return res.send("Error loading categories.");
    if (!categories || categories.length === 0) {
      return res.render("categories", { title: "Categories", categories: [] });
    }

    const catData = [];
    categories.forEach((cat) => {
      const sqlRecipe = `
        SELECT id, title, summary
        FROM recipes
        WHERE category_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `;
      db.get(sqlRecipe, [cat.id], (recErr, oneRecipe) => {
        catData.push({
          id: cat.id,
          name: cat.name,
          description: cat.description,
          recipe: oneRecipe || null,
        });

        if (catData.length === categories.length) {
          res.render("categories", {
            title: "Categories",
            categories: catData,
          });
        }
      });
    });
  });
});

// Recipes list (pagination)
app.get("/recipes", (req, res) => {
  const recipesPerPage = 3;
  let page = Number(req.query.page) || 1;
  if (page < 1) page = 1;

  const countSql = `SELECT COUNT(*) AS total FROM recipes`;
  db.get(countSql, [], (countErr, countRow) => {
    if (countErr) return res.status(500).send("Error counting recipes.");

    const totalRecipes = countRow ? countRow.total : 0;
    const totalPages = Math.max(1, Math.ceil(totalRecipes / recipesPerPage));
    if (page > totalPages) page = totalPages;

    const offset = (page - 1) * recipesPerPage;

    const listSql = `
      SELECT r.id, r.title, r.summary, c.name AS category
      FROM recipes r
      JOIN categories c ON r.category_id = c.id
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `;
    db.all(listSql, [recipesPerPage, offset], (listErr, rows) => {
      if (listErr) return res.status(500).send("Error loading recipes.");
      res.render("recipes", {
        title: "Recipes",
        recipes: rows,
        pagination: {
          currentPage: page,
          totalPages,
          hasPrevious: page > 1,
          hasNext: page < totalPages,
          prevPage: page - 1,
          nextPage: page + 1,
        },
      });
    });
  });
});

// Recipe detail
app.get("/item/:id", (req, res) => {
  const recipeId = req.params.id;

  const recipeSql = `
    SELECT r.*, c.name AS category
    FROM recipes r
    JOIN categories c ON c.id = r.category_id
    WHERE r.id = ?
  `;
  db.get(recipeSql, [recipeId], (recipeErr, recipe) => {
    if (recipeErr) return res.status(500).send("Error loading recipe.");
    if (!recipe) return res.status(404).render("404", { title: "Not found" });

    const ingSql = `
      SELECT name, amount
      FROM ingredients
      WHERE recipe_id = ?
      ORDER BY id ASC
    `;
    db.all(ingSql, [recipeId], (ingErr, ingredients) => {
      if (ingErr) return res.status(500).send("Error loading ingredients.");

      const imgSql = `
        SELECT id, filename
        FROM images
        WHERE recipe_id = ?
        ORDER BY uploaded_at DESC, id DESC
        LIMIT 1
      `;
      db.get(imgSql, [recipeId], (imgErr, imageRow) => {
        if (imgErr) return res.status(500).send("Error loading image.");

        // normalize path for template
        let images = [];
        if (imageRow) {
          const raw = imageRow.filename || "";
          const web = raw.startsWith("/img/") ? raw : `/img/${raw}`;
          images = [{ id: imageRow.id, filename: raw, web }];
        }

        const instructionsLines = (recipe.instructions || "")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);

        res.render("detail", {
          title: recipe.title,
          recipe,
          ingredients,
          images,
          instructionsLines,
          cacheBuster: Date.now(),
        });
      });
    });
  });
});

//  IMAGE UPLOAD/DELETE (must be logged in)

// Upload / replace image
app.post(
  "/item/:id/image",
  requireLogin,
  upload.single("image"),
  (req, res) => {
    const recipeId = req.params.id;
    if (!req.file)
      return res.status(400).send("Please choose a PNG or JPG image.");

    const webPath = "/img/" + req.file.filename;

    db.get(
      `SELECT id, filename FROM images WHERE recipe_id = ?`,
      [recipeId],
      (selErr, row) => {
        if (selErr) return res.status(500).send("DB error (reading image).");

        if (!row) {
          const ins = `INSERT INTO images (recipe_id, filename, uploaded_at)
                     VALUES (?, ?, CURRENT_TIMESTAMP)`;
          db.run(ins, [recipeId, webPath], (insErr) => {
            if (insErr)
              return res.status(500).send("DB error (inserting image).");
            res.redirect(`/item/${recipeId}`);
          });
        } else {
          const oldWebPath = row.filename;
          const upd = `UPDATE images
                     SET filename = ?, uploaded_at = CURRENT_TIMESTAMP
                     WHERE recipe_id = ?`;
          db.run(upd, [webPath, recipeId], async (updErr) => {
            if (updErr)
              return res.status(500).send("DB error (updating image).");

            if (oldWebPath) {
              const oldBase = oldWebPath.replace(/^\/img\//, "");
              try {
                await fs.unlink(path.join(UPLOADS_DIR, oldBase));
              } catch {}
            }
            res.redirect(`/item/${recipeId}`);
          });
        }
      }
    );
  }
);

// Delete image (DB row + file)
app.post("/item/:id/image/delete", requireLogin, (req, res) => {
  const recipeId = req.params.id;

  db.get(
    `SELECT filename FROM images WHERE recipe_id = ?`,
    [recipeId],
    async (err, row) => {
      if (err) return res.status(500).send("DB error (select for delete).");
      if (!row) return res.redirect(`/item/${recipeId}`);

      db.run(
        `DELETE FROM images WHERE recipe_id = ?`,
        [recipeId],
        async (delErr) => {
          if (delErr) return res.status(500).send("DB error (delete row).");

          const webPath = row.filename;
          const baseName = webPath.replace(/^\/img\//, "");
          if (baseName) {
            try {
              await fs.unlink(path.join(UPLOADS_DIR, baseName));
            } catch {}
          }
          res.redirect(`/item/${recipeId}`);
        }
      );
    }
  );
});

//  Admin Users CRUD
app.get("/admin/users", requireAdmin, (req, res) => {
  const editId = Number(req.query.edit) || null;

  db.all(
    `SELECT id, username FROM users ORDER BY id ASC`,
    [],
    (listErr, users) => {
      if (listErr) return res.status(500).send("DB error (list users).");

      if (!editId) {
        // Show list
        return res.render("admin-users", {
          title: "Manage Users",
          users,
          mode: "create",
        });
      }

      db.get(
        `SELECT id, username FROM users WHERE id = ?`,
        [editId],
        (readErr, userToEdit) => {
          if (readErr) return res.status(500).send("DB error (read user).");
          if (!userToEdit) return res.redirect("/admin/users"); // id not found

          return res.render("admin-users", {
            title: "Manage Users",
            users,
            mode: "edit",
            userToEdit,
          });
        }
      );
    }
  );
});

app.post("/admin/users", requireAdmin, (req, res) => {
  const username = req.body.username;
  const password = req.body.password;
  if (!username || !password) {
    return res.status(400).send("Username and password are required.");
  }

  bcrypt.hash(password, 12, (err, hash) => {
    if (err) return res.status(500).send("Error hashing password.");
    db.run(
      `INSERT INTO users (username, password_hash) VALUES (?, ?)`,
      [username.trim(), hash],
      (insErr) => {
        if (insErr) return res.status(500).send("DB error (create user).");
        res.redirect("/admin/users");
      }
    );
  });
});

app.post("/admin/users/:id/edit", requireAdmin, (req, res) => {
  const userId = req.params.id;
  const { username, password } = req.body;
  if (!username) return res.status(400).send("Username is required.");

  const cleanUsername = username.trim();

  // hash & update both
  if (password && password.trim()) {
    bcrypt.hash(password, 12, (err, hash) => {
      if (err) return res.status(500).send("Error hashing password.");
      db.run(
        `UPDATE users SET username = ?, password_hash = ? WHERE id = ?`,
        [cleanUsername, hash, userId],
        (updErr) => {
          if (updErr) return res.status(500).send("DB error (update user).");
          res.redirect("/admin/users");
        }
      );
    });
  } else {
    // Only update username
    db.run(
      `UPDATE users SET username = ? WHERE id = ?`,
      [cleanUsername, userId],
      (updErr) => {
        if (updErr) return res.status(500).send("DB error (update user).");
        res.redirect("/admin/users");
      }
    );
  }
});

app.post("/admin/users/:id/delete", requireAdmin, (req, res) => {
  db.run(`DELETE FROM users WHERE id = ?`, [req.params.id], (delErr) => {
    if (delErr) return res.status(500).send("DB error (delete user).");
    res.redirect("/admin/users");
  });
});

// 404
app.use((req, res) => {
  res.status(404).render("404", { title: "Not found" });
});

//  START
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
