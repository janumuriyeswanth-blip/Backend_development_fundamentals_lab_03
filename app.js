
const express = require("express");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = 3000;

app.use(express.json());

// Connect to SQLite database
const db = new sqlite3.Database("./books.db", (err) => {
    if (err) {
        console.error("Database connection error:", err.message);
    } else {
        console.log("Connected to SQLite database.");
    }
});

// Create books table and insert sample data
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS books (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            author TEXT NOT NULL,
            price REAL NOT NULL,
            pages INTEGER NOT NULL
        )
    `, (err) => {
        if (err) {
            console.error("Table creation error:", err.message);
            return;
        }

        db.get("SELECT COUNT(*) AS count FROM books", (err, row) => {
            if (err) {
                console.error(err.message);
                return;
            }

            if (row.count === 0) {
                const books = [
                    ["Wings of Fire", "A.P.J. Abdul Kalam", 250, 180],
                    ["The Alchemist", "Paulo Coelho", 300, 208],
                    ["Atomic Habits", "James Clear", 450, 320]
                ];

                const stmt = db.prepare(
                    "INSERT INTO books (title, author, price, pages) VALUES (?, ?, ?, ?)"
                );

                books.forEach(book => stmt.run(book));
                stmt.finalize();
            }

            console.log("Books table is ready.");
        });
    });
});

// GET books with search, filter, sorting and pagination
app.get("/books", (req, res) => {
    const {
        search,
        minPrice,
        maxPrice,
        sortBy,
        order,
        limit,
        offset
    } = req.query;

    let sql = "SELECT * FROM books WHERE 1=1";
    const params = [];

    if (search) {
        sql += " AND (title LIKE ? OR author LIKE ?)";
        params.push(`%${search}%`, `%${search}%`);
    }

    if (minPrice !== undefined) {
        if (minPrice.trim() === "" || !Number.isFinite(Number(minPrice)) || Number(minPrice) < 0) {
            return res.status(400).json({
                error: "minPrice must be a valid non-negative number"
            });
        }
        sql += " AND price >= ?";
        params.push(Number(minPrice));
    }

    if (maxPrice !== undefined) {
        if (maxPrice.trim() === "" || !Number.isFinite(Number(maxPrice)) || Number(maxPrice) < 0) {
            return res.status(400).json({
                error: "maxPrice must be a valid non-negative number"
            });
        }
        sql += " AND price <= ?";
        params.push(Number(maxPrice));
    }

    if (
        minPrice !== undefined &&
        maxPrice !== undefined &&
        Number(minPrice) > Number(maxPrice)
    ) {
        return res.status(400).json({
            error: "minPrice cannot be greater than maxPrice"
        });
    }

    const allowedSortFields = ["title", "author", "price", "pages"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "id";
    const sortOrder = order === "desc" ? "DESC" : "ASC";

    sql += ` ORDER BY ${sortField} ${sortOrder}`;

    const pageLimit = Number(limit) || 10;
    const pageOffset = Number(offset) || 0;

    if (
        !Number.isInteger(pageLimit) ||
        pageLimit < 1 ||
        !Number.isInteger(pageOffset) ||
        pageOffset < 0
    ) {
        return res.status(400).json({
            error: "limit must be positive and offset must be non-negative integers"
        });
    }

    sql += " LIMIT ? OFFSET ?";
    params.push(pageLimit, pageOffset);

    db.all(sql, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        res.json(rows);
    });
});
// POST - Create a new book
app.post("/books", (req, res) => {
    const { title, author, price, pages } = req.body;

    // Validate required fields
    if (!title || !author || price === undefined) {
        return res.status(400).json({
            message: "Title, author and price are required"
        });
    }

    if (
        typeof price !== "number" ||
        !Number.isFinite(price) ||
        price < 0
    ) {
        return res.status(400).json({
            message: "Price must be a valid non-negative number"
        });
    }

    const bookPages = pages === undefined ? 1 : pages;

    if (!Number.isInteger(bookPages) || bookPages < 1) {
        return res.status(400).json({
            message: "Pages must be a positive integer"
        });
    }

    const sql = `
        INSERT INTO books (title, author, price, pages)
        VALUES (?, ?, ?, ?)
    `;

    db.run(sql, [title, author, price, bookPages], function (err) {
        if (err) {
            return res.status(500).json({
                message: "Failed to create book"
            });
        }

        res.status(201).json({
            message: "Book created successfully",
            bookId: this.lastID
        });
    });
});
// PUT - Update an existing book
app.put("/books/:bookId", (req, res) => {
    const { bookId } = req.params;
    const { title, author, price, pages } = req.body;

    if (!title || !author || price === undefined) {
        return res.status(400).json({
            message: "Title, author and price are required"
        });
    }

    if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
        return res.status(400).json({
            message: "Price must be a valid non-negative number"
        });
    }

    const bookPages = pages === undefined ? 1 : pages;

    if (!Number.isInteger(bookPages) || bookPages < 1) {
        return res.status(400).json({
            message: "Pages must be a positive integer"
        });
    }

    const sql = `
        UPDATE books
        SET title = ?, author = ?, price = ?, pages = ?
        WHERE id = ?
    `;

    db.run(sql, [title, author, price, bookPages, bookId], function (err) {
        if (err) {
            return res.status(500).json({
                message: "Failed to update book"
            });
        }

        if (this.changes === 0) {
            return res.status(404).json({
                message: "Book not found"
            });
        }

        res.status(200).json({
            message: "Book updated successfully"
        });
    });
});
// DELETE - Remove a book
app.delete("/books/:bookId", (req, res) => {
    const { bookId } = req.params;

    const sql = "DELETE FROM books WHERE id = ?";

    db.run(sql, [bookId], function (err) {
        if (err) {
            return res.status(500).json({
                message: "Failed to delete book"
            });
        }

        if (this.changes === 0) {
            return res.status(404).json({
                message: "Book not found"
            });
        }

        res.status(200).json({
            message: "Book deleted successfully"
        });
    });
});


// Start server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
