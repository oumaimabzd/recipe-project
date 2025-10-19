//  IMPORTS (bring tools we need)

const path = require("path"); // // helps build safe file paths
const express = require("express"); // // web server framework
const exphbs = require("express-handlebars"); // // lets us use Handlebars templates
const sqlite3 = require("sqlite3").verbose(); // // talk to the SQLite database file
const bodyParser = require("body-parser"); // for the password
const bcrypt = require("bcrypt"); // // used to hash passwords and check them securely
//  DATABASE FILE (where your data lives)

const DB_FILE = path.join(__dirname, "recipe.sqlite3.db"); // // make a full path to the database file

//  APP SETUP (make the server)

const app = express();
const PORT = 3003;
const DB_FILE = path.join(__dirname, "recipe.sqlite3.db");

// for login checks already hashed in DB
const PW_COL = "password_hash";
const SALT_ROUNDS = 12;

//
app.use(express.static(path.join(__dirname, "public")));

app.use(bodyParser.urlencoded({ extended: false }));
//  HANDLEBARS
app.engine("handlebars", exphbs.engine({ defaultLayout: "main" }));
app.set("view engine", "handlebars");
app.set("views", path.join(__dirname, "views"));

// OPEN THE SQLITE DATABASE
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error("Could not open the database file:", err);
  } else {
    console.log("Connected to database:", DB_FILE);
    db.run("PRAGMA foreign_keys = ON"); // make SQLite respect foreign keys
  }
});

// MULTER
const UPLOADS_DIR = path.join(__dirname, "public", "img");

(async () => {
  try {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  } catch {}
})();

// diskStorage so we keep the file extension (.jpg/.png) and make a random name
const storage = multer.diskStorage({
  //save the physical file
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),

  // how to name the file (keep it simple: random + original ext)
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || ".jpg").toLowerCase();
    const rnd = Math.random().toString(36).slice(2, 10); // e.g. "q7x3h2k9"
    cb(null, rnd + ext); // final filename like "q7x3h2k9.jpg"
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

// ROUTE

// Home
app.get("/", (req, res) => {
  res.render("home", { title: "Home" });
});

// Login
app.get("/login", (req, res) => {
  res.render("login", { title: "Login Form", heading: "Log in" });
});

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
      // username not found
      return res.render("login", {
        title: "Login Form",
        heading: "Log in",
        error: "Wrong Username or Password",
        un,
      });
    }

    // compare typed password vs hashed
    bcrypt.compare(pw, row.password_hash, (cmpErr, ok) => {
      if (cmpErr || !ok) {
        return res.render("login", {
          title: "Login Form",
          heading: "Log in",
          error: "Wrong Username or Password",
          un,
        });
      }
      res.redirect("/recipes");
    });
  });
});

// About page
app.get("/about", (req, res) => {
  res.render("about", { title: "About" });
});

// Categories page:
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

    const catData = []; // we'll push each category with its one recipe

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
          recipe: oneRecipe,
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

// Recipes list with pagination (3 per page)
app.get("/recipes", (req, res) => {
  const recipesPerPage = 3;
  let page = Number(req.query.page) || 1;
  if (page < 1) page = 1;

  // how many total recipes
  const countSql = `SELECT COUNT(*) AS total FROM recipes`;
  db.get(countSql, [], (countErr, countRow) => {
    if (countErr) return res.status(500).send("Error counting recipes.");

    const totalRecipes = countRow ? countRow.total : 0;
    const totalPages = Math.max(1, Math.ceil(totalRecipes / recipesPerPage));
    if (page > totalPages) page = totalPages;

    const offset = (page - 1) * recipesPerPage;

    // get the rows for this page
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

  // get the recipe and category name
  const recipeSql = `
    SELECT r.*, c.name AS category
    FROM recipes r
    JOIN categories c ON c.id = r.category_id
    WHERE r.id = ?
  `;
  db.get(recipeSql, [recipeId], (recipeErr, recipe) => {
    if (recipeErr) return res.status(500).send("Error loading recipe.");
    if (!recipe) return res.status(404).render("404", { title: "Not found" });

    // ingredients for this recipe
    const ingSql = `
      SELECT name, amount
      FROM ingredients
      WHERE recipe_id = ?
      ORDER BY id ASC
    `;
    db.all(ingSql, [recipeId], (ingErr, ingredients) => {
      if (ingErr) return res.status(500).send("Error loading ingredients.");

      // latest image for this recipe
      const imgSql = `
        SELECT id, filename
        FROM images
        WHERE recipe_id = ?
        ORDER BY uploaded_at DESC, id DESC
        LIMIT 1
      `;
      db.get(imgSql, [recipeId], (imgErr, imageRow) => {
        if (imgErr) return res.status(500).send("Error loading image.");

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

// IMAGE UPLOAD
app.post("/item/:id/image", upload.single("image"), (req, res) => {
  const recipeId = req.params.id;

  // make sure a file was chosen
  if (!req.file)
    return res.status(400).send("Please choose a PNG or JPG image.");

  const webPath = "/img/" + req.file.filename; // physical file is in /public/img

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
        // replace: UPDATE the row and delete the old physical file
        const oldWebPath = row.filename;
        const upd = `UPDATE images
                     SET filename = ?, uploaded_at = CURRENT_TIMESTAMP
                     WHERE recipe_id = ?`;
        db.run(upd, [webPath, recipeId], async (updErr) => {
          if (updErr) return res.status(500).send("DB error (updating image).");

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
});

// IMAGE DELETE
app.post("/item/:id/image/delete", (req, res) => {
  const recipeId = req.params.id;

  db.get(
    `SELECT filename FROM images WHERE recipe_id = ?`,
    [recipeId],
    async (err, row) => {
      if (err) return res.status(500).send("DB error (select for delete).");
      if (!row) return res.redirect(`/item/${recipeId}`); // nothing to delete

      // delete the DB row
      db.run(
        `DELETE FROM images WHERE recipe_id = ?`,
        [recipeId],
        async (delErr) => {
          if (delErr) return res.status(500).send("DB error (delete row).");

          //  delete the physical
          const webPath = row.filename; // e.g. "/img/abcd1234.jpg"
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

//404 error
app.use((req, res) => {
  res.status(404).render("404", { title: "Not found" });
});

// server start
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
