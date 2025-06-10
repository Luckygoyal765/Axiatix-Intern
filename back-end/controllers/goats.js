// controllers/goats.js
const db = require('../config/db');

// --- Helper function to Promisify db.query (Crucial for async/await) ---
// This is needed if your 'db' object's .query method does not natively return Promises.
// If your 'db' object already returns Promises (e.g., from 'mysql2/promise' or 'pg'),
// you can remove this helper and directly 'await db.query(...)'.
const queryPromise = (sql, params) => {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
            if (err) {
                return reject(err);
            }
            resolve(results);
        });
    });
};
// --- End Helper Function ---

const parseBoolean = (val) => {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') return val.toLowerCase() === 'true';
    return false;
};

const parseNumber = (val) => {
    const num = parseFloat(val);
    return isNaN(num) ? null : num;
};

const addGoat = (req, res) => {
    const userId = req.user.userId;
    const {
        goat_number, breed, dob, weight,
        health_status, minimum_price, maximum_price, price, is_active
    } = req.body;
    const image_url = req.file ? `/uploads/${req.file.filename}` : null;

    if (!goat_number || !breed || !dob || !weight || !health_status || !minimum_price || !maximum_price || !image_url) {
        return res.status(400).json({ message: 'All required fields must be provided, including an image' });
    }

    const weightNum = parseNumber(weight);
    const minPriceNum = parseNumber(minimum_price);
    const maxPriceNum = parseNumber(maximum_price);
    const priceNum = price ? parseNumber(price) : null;

    if (weightNum === null || weightNum <= 0 || minPriceNum === null || minPriceNum <= 0 || maxPriceNum === null || maxPriceNum <= 0) {
        return res.status(400).json({ message: 'Weight and prices must be valid numbers greater than 0' });
    }
    if (minPriceNum > maxPriceNum) {
        return res.status(400).json({ message: 'Minimum price cannot exceed maximum price' });
    }
    if (priceNum !== null && priceNum <= 0) {
        return res.status(400).json({ message: 'Fixed price must be greater than 0 if provided' });
    }
    if (new Date(dob) > new Date()) {
        return res.status(400).json({ message: 'Date of birth cannot be in the future' });
    }

    db.query('SELECT can_sell FROM customers WHERE user_id = ?', [userId], (err, customerResults) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err.message });
        if (customerResults.length === 0 || !customerResults[0].can_sell) {
            return res.status(403).json({ message: 'You are not authorized to sell goats' });
        }

        db.query('SELECT id FROM goats WHERE goat_number = ?', [goat_number], (err, results) => {
            if (err) return res.status(500).json({ message: 'Database error', error: err.message });
            if (results.length > 0) {
                return res.status(400).json({ message: 'Goat number already exists' });
            }

            db.query(
                `INSERT INTO goats (user_id, goat_number, breed, dob, weight, health_status, minimum_price, maximum_price, price, is_active, image_url, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                [userId, goat_number, breed, dob, weightNum, health_status, minPriceNum, maxPriceNum, priceNum, parseBoolean(is_active), image_url],
                (err) => {
                    if (err) return res.status(500).json({ message: 'Failed to register goat', error: err.message });
                    res.status(201).json({ message: 'Goat registered successfully' });
                }
            );
        });
    });
};

const getMyGoats = (req, res) => {
    const userId = req.user.userId;
    db.query('SELECT * FROM goats WHERE user_id = ?', [userId], (err, results) => {
        if (err) return res.status(500).json({ message: 'Failed to retrieve goats', error: err.message });
        res.json(results);
    });
};

const updateGoat = (req, res) => {
    const userId = req.user.userId;
    const goatId = req.params.id;
    const {
        goat_number, breed, dob, weight,
        health_status, minimum_price, maximum_price, price
    } = req.body;
    const image_url = req.file ? `/uploads/${req.file.filename}` : null;

    db.query('SELECT * FROM goats WHERE id = ? AND user_id = ?', [goatId, userId], (err, results) => {
        if (err) return res.status(500).json({ message: 'DB error', error: err.message });
        if (results.length === 0) return res.status(404).json({ message: 'Goat not found' });

        const existing = results[0];
        const finalImage = image_url || existing.image_url;

        db.query(
            `UPDATE goats SET goat_number = ?, breed = ?, dob = ?, weight = ?, health_status = ?, 
             minimum_price = ?, maximum_price = ?, price = ?, image_url = ? WHERE id = ?`,
            [
                goat_number || existing.goat_number,
                breed || existing.breed,
                dob || existing.dob,
                weight || existing.weight,
                health_status || existing.health_status,
                minimum_price || existing.minimum_price,
                maximum_price || existing.maximum_price,
                price || existing.price,
                finalImage,
                goatId
            ],
            (err) => {
                if (err) return res.status(500).json({ message: 'Failed to update goat', error: err.message });
                res.json({ message: 'Goat updated successfully' });
            }
        );
    });
};

const deactivateGoat = (req, res) => {
    const userId = req.user.userId;
    const goatId = req.params.id;

    db.query('UPDATE goats SET is_active = 0 WHERE id = ? AND user_id = ?', [goatId, userId], (err, result) => {
        if (err) return res.status(500).json({ message: 'Failed to deactivate goat', error: err.message });
        res.json({ message: 'Goat deactivated successfully' });
    });
};

const getAvailableGoats = (req, res) => {
    db.query('SELECT * FROM goats WHERE is_active = 1', (err, results) => {
        if (err) return res.status(500).json({ message: 'Failed to fetch available goats', error: err.message });
        res.json(results);
    });
};

const addPurchase = (req, res) => {
    const buyerId = req.user.userId;
    const { goat_id, price } = req.body;

    if (!goat_id || !price) return res.status(400).json({ message: 'Goat ID and price are required.' });

    db.query(
        'INSERT INTO purchases (buyer_id, goat_id, price, purchase_date) VALUES (?, ?, ?, NOW())',
        [buyerId, goat_id, price],
        (err) => {
            if (err) return res.status(500).json({ message: 'Failed to record purchase', error: err.message });
            db.query('UPDATE goats SET is_active = 0 WHERE id = ?', [goat_id]);
            res.status(201).json({ message: 'Purchase recorded successfully' });
        }
    );
};

const getPurchases = (req, res) => {
    const userId = req.user.userId;
    db.query(
        `SELECT p.*, g.goat_number, g.breed, g.weight, g.minimum_price, g.maximum_price, g.price, g.image_url
         FROM purchases p JOIN goats g ON p.goat_id = g.id WHERE p.buyer_id = ? ORDER BY p.purchase_date DESC`,
        [userId],
        (err, results) => {
            if (err) return res.status(500).json({ message: 'Failed to fetch purchases', error: err.message });
            res.json(results);
        }
    );
};

const addHealthRecord = (req, res) => {
    const userId = req.user.userId;
    const { goat_id, health_type, description, veterinarian, date_checked, next_due_date, status } = req.body;

    // Basic validation
    if (!goat_id || !health_type || !date_checked || !status) {
        return res.status(400).json({ message: 'Required health record fields missing.' });
    }

    db.query(
        `INSERT INTO goat_health_records (goat_id, health_type, description, veterinarian, date_checked, next_due_date, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [goat_id, health_type, description || null, veterinarian || null, date_checked, next_due_date || null, status],
        (err) => {
            if (err) {
                console.error('Error adding health record:', err);
                return res.status(500).json({ message: 'Failed to add health record', error: err.message });
            }
            res.status(201).json({ message: 'Health record added successfully' });
        }
    );
};


const getHealthRecords = (req, res) => {
    const goatId = req.params.goatId;
    db.query('SELECT * FROM goat_health_records WHERE goat_id = ?', [goatId], (err, results) => {
        if (err) return res.status(500).json({ message: 'Failed to fetch health records', error: err.message });
        res.json(results);
    });
};

const updateHealthRecord = (req, res) => {
    const recordId = req.params.id;
    const { health_type, description, veterinarian, date_checked, next_due_date, status } = req.body;

    // Basic validation
    if (!health_type || !date_checked || !status) {
        return res.status(400).json({ message: 'Required health record fields missing for update.' });
    }

    db.query(
        `UPDATE goat_health_records SET health_type = ?, description = ?, veterinarian = ?, date_checked = ?, next_due_date = ?, status = ? WHERE id = ?`,
        [health_type, description || null, veterinarian || null, date_checked, next_due_date || null, status, recordId],
        (err) => {
            if (err) {
                console.error('Error updating health record:', err);
                return res.status(500).json({ message: 'Failed to update health record', error: err.message });
            }
            res.json({ message: 'Health record updated successfully' });
        }
    );
};


const deleteHealthRecord = (req, res) => {
    const recordId = req.params.id;

    db.query('DELETE FROM goat_health_records WHERE id = ?', [recordId], (err) => {
        if (err) return res.status(500).json({ message: 'Failed to delete health record', error: err.message });
        res.json({ message: 'Health record deleted successfully' });
    });
};

// MODIFIED getAllHealthRecords function
const getAllHealthRecords = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        // 1. Get total count
        const countSql = `SELECT COUNT(*) AS total FROM goat_health_records`;
        const countResult = await queryPromise(countSql); // Using the promisified query

        // Determine how to access the total count based on your DB client (e.g., mysql2 vs pg)
        const totalRecords = countResult[0] && countResult[0].total !== undefined // For mysql2 array of arrays or if results is direct array
            ? parseInt(countResult[0].total)
            : (countResult.rows && countResult.rows[0] && countResult.rows[0].total !== undefined // For pg result object
                ? parseInt(countResult.rows[0].total)
                : 0); // Default to 0 if no results or total property missing


        // 2. Get paginated health records with goat details
        const recordsSql = `
            SELECT
                gh.id,
                gh.goat_id,
                g.goat_number,
                g.breed,
                gh.date_checked,
                gh.health_type,
                gh.description,
                gh.veterinarian,
                gh.next_due_date,
                gh.status,
                gh.created_at
            FROM
                goat_health_records gh
            JOIN
                goats g ON gh.goat_id = g.id
            ORDER BY gh.created_at DESC
            LIMIT ? OFFSET ?; -- Use ? for MySQL, $1, $2 for PostgreSQL
        `;

        const recordsResult = await queryPromise(recordsSql, [limit, offset]); // Using the promisified query

        // Determine how to access the records array based on your DB client
        const records = recordsResult.rows ? recordsResult.rows : recordsResult; // For pg vs mysql2

        const totalPages = Math.ceil(totalRecords / limit);

        res.status(200).json({
            success: true,
            records: records,
            currentPage: page,
            totalPages: totalPages,
            totalRecords: totalRecords,
        });

    } catch (error) {
        console.error("❌ Error in getAllHealthRecords:", error);
        res.status(500).json({ success: false, message: "Internal Server Error while fetching health records." });
    }
};

module.exports = {
    addGoat,
    getMyGoats,
    updateGoat,
    deactivateGoat,
    getAvailableGoats,
    addPurchase,
    getPurchases,
    addHealthRecord,
    getHealthRecords,
    updateHealthRecord,
    deleteHealthRecord,
    getAllHealthRecords
};