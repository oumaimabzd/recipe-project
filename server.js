// 1) Imports
const path = require("path");
const express = require("express");
const exphbs = require("express-handlebars");

// 2) App s
const app = express();
const PORT = 3003;

// access
app.use(express.static(path.join(__dirname, "public")));

// 4) Handlebars
app.engine("handlebars", exphbs.engine({ defaultLayout: "main" }));
app.set("view engine", "handlebars");
app.set("views", path.join(__dirname, "views"));

//  Routes
app.get("/", (req, res) => {
  res.render("home", { title: "Home" });
});

app.get("/about", (req, res) => {
  res.render("about", { title: "About" });
});

app.get("/list", (req, res) => {
  res.render("contact", { title: "Contact" });
});

// err
app.use((req, res) => res.status(404).render("404", { title: "Not found" }));

//
app.listen(PORT, () => {
  console.log(`Example app listening on http://localhost:${PORT}...`);
});
