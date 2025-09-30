//  IMPORTS (bring tools we need)

const path = require("path"); // // helps build safe file paths
const express = require("express"); // // web server framework
const exphbs = require("express-handlebars"); // // lets us use Handlebars templates
const sqlite3 = require("sqlite3").verbose(); // // talk to the SQLite database file

//  DATABASE FILE (where your data lives)

const DB_FILE = path.join(__dirname, "recipe.sqlite3.db"); // // make a full path to the database file

//  APP SETUP (make the server)

const app = express(); // // create the Express app (the server)
const PORT = 3003; // // web address will be http://localhost:3003

// This serves files from the "public" folder directly in the browser.
// Example: "public/css/styles.css" is available at "/css/styles.css".
app.use(express.static(path.join(__dirname, "public")));

//  HANDLEBARS

//  Tell Express how to render ".handlebars" files and which layout to use.
app.engine("handlebars", exphbs.engine({ defaultLayout: "main" })); // // default layout = "views/layouts/main.handlebars"
app.set("view engine", "handlebars"); // // use Handlebars for res.render(...)
app.set("views", path.join(__dirname, "views")); // // templates live in /views

//  OPEN THE DATABASE

// Try to open the database file. If it fails, show an error in the console.
// Turn ON foreign keys so relations are respected (good practice).
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error("Could not open the database file:", err);
  } else {
    console.log("Connected to database:", DB_FILE);
    db.run("PRAGMA foreign_keys = ON"); // // make SQLite respect foreign keys and not ignore by default
  }
});

// ROUTES (what to show on each URL)

//  Home page (simple static page)
app.get("/", (req, res) => {
  // // Render "views/home.handlebars" and pass a title variable the page can use
  res.render("home", { title: "Home" });
});

//  About page (simple static page)
app.get("/about", (req, res) => {
  res.render("about", { title: "About" });
});

//  RECIPES LIST WITH PAGINATION

//  We show 3 recipes per page.

app.get("/recipes", (req, res) => {
  const recipesPerPage = 3; // // how many recipes to show on one page
  let page = Number(req.query.page) || 1; // // get page number from the URL (if missing or bad -> 1)
  if (page < 1) page = 1; // // never go below page 1

  // Count how many recipes exist in total.
  //    (Simple because every recipe is valid for listing.)
  const countSql = `SELECT COUNT(*) AS total FROM recipes`;

  db.get(countSql, [], (countErr, countRow) => {
    if (countErr) {
      // // if the count fails, send a server error
      return res.status(500).send("Error counting recipes.");
    }

    const totalRecipes = countRow ? countRow.total : 0; // // how many recipes exist
    const totalPages = Math.max(1, Math.ceil(totalRecipes / recipesPerPage)); // // how many pages in total
    if (page > totalPages) page = totalPages; // // do not go past the last page

    const offset = (page - 1) * recipesPerPage; // // how many recipes to skip before showing this page

    //  Get the recipes for this page.
    //    Join recipes + categories to show the category name.
    //    We don’t join ingredients here because you said every recipe has ingredients (kept simple).
    const listSql = `
      SELECT r.id, r.title, r.summary, c.name AS category
      FROM recipes r
      JOIN categories c ON r.category_id = c.id
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `;

    db.all(listSql, [recipesPerPage, offset], (listErr, rows) => {
      if (listErr) {
        return res.status(500).send("Error loading recipes.");
      }

      // // Make info for the Prev / Next buttons
      const hasPrev = page > 1;
      const hasNext = page < totalPages;

      // // Render "views/recipes.handlebars" with the data it needs
      res.render("recipes", {
        title: "Recipes", // // page title
        recipes: rows, // // the recipes to show on this page
        pagination: {
          // // info for the pagination UI
          currentPage: page,
          totalPages: totalPages,
          hasPrevious: hasPrev,
          hasNext: hasNext,
          prevPage: page - 1,
          nextPage: page + 1,
        },
      });
    });
  });
});

//  RECIPE DETAIL PAGE
// // URL example: /item/5
// // Show one recipe with its ingredients and images.
app.get("/item/:id", (req, res) => {
  const recipeId = req.params.id; // // read the id from the URL (like /item/5 -> "5")

  // 1) Get the recipe + its category name
  const recipeSql = `
    SELECT r.*, c.name AS category
    FROM recipes r
    JOIN categories c ON c.id = r.category_id
    WHERE r.id = ?
  `;
  db.get(recipeSql, [recipeId], (recipeErr, recipe) => {
    if (recipeErr) {
      return res.status(500).send("Error loading recipe.");
    }
    if (!recipe) {
      // // No recipe with that id -> show 404 page
      return res.status(404).render("404", { title: "Not found" });
    }

    // 2) Get the ingredients for this recipe
    const ingSql = `SELECT name, amount FROM ingredients WHERE recipe_id = ?`;
    db.all(ingSql, [recipeId], (ingErr, ingredients) => {
      if (ingErr) {
        return res.status(500).send("Error loading ingredients.");
      }

      // 3) Get any images for this recipe (your table allows one image per recipe)
      const imgSql = `SELECT filename FROM images WHERE recipe_id = ?`;
      db.all(imgSql, [recipeId], (imgErr, images) => {
        if (imgErr) {
          return res.status(500).send("Error loading images.");
        }

        // 4) Render the detail page with all the data
        res.render("detail", {
          title: recipe.title,
          recipe, // // the recipe row (title, summary, instructions, etc.)
          ingredients, // // list of its ingredients
          images, // // list of its image(s)
        });
      });
    });
  });
});

// 8) 404 PAGE (for any unknown URL)

app.use((req, res) => {
  res.status(404).render("404", { title: "Not found" });
});

// 9) START THE SERVER

// // Start listening. Open http://localhost:3003 in your browser.
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
