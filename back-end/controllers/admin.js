const db = require('../config/db');

const listCustomers = (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const sql = `
    SELECT c.user_id, u.username, u.email, c.address, c.photo, c.can_buy, c.can_sell
    FROM customers c
    JOIN users u ON c.user_id = u.id
    LIMIT ? OFFSET ?
  `;
    db.query(sql, [limit, offset], (err, results) => {
        if (err) {
            console.error('Error fetching customers:', err);
            return res.status(500).json({ message: 'Failed to retrieve customers' });
        }
        res.json(results);
    });
};

const approveSeller = (req, res) => {
    const userId = req.params.userId;

    const sql = 'UPDATE customers SET can_sell = 1 WHERE user_id = ?';
    db.query(sql, [userId], (err, result) => {
        if (err) {
            console.error('Error updating can_sell:', err);
            return res.status(500).json({ message: 'Failed to approve seller' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        res.json({ message: 'Seller approved successfully' });
    });
};


// ... (existing listCustomers and approveSeller functions)

const rejectSeller = (req, res) => {
    const userId = req.params.userId;

    const sql = 'UPDATE customers SET can_sell = 0 WHERE user_id = ?'; // Set to 0 for reject
    db.query(sql, [userId], (err, result) => {
        if (err) {
            console.error('Error updating can_sell for rejection:', err);
            return res.status(500).json({ message: 'Failed to reject seller' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        res.json({ message: 'Seller rejected successfully.' });
    });
};

module.exports = {
    listCustomers,
    approveSeller,
    rejectSeller
};