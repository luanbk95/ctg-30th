const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Route to handle form submission
app.post('/submit', (req, res) => {
    const data = req.body;
    const filePath = path.join(dataDir, 'registrations.json');
    let registrations = [];
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath);
        registrations = content.length ? JSON.parse(content) : [];
    }
    registrations.push({
        name: data.name,
        graduationYear: data.graduationYear,
        phone: data.phone,
        email: data.email,
        attending: data.attending,
        timestamp: new Date().toISOString()
    });
    fs.writeFileSync(filePath, JSON.stringify(registrations, null, 2));
    res.json({ status: 'success' });
});

// Route to view registrations (admin access)
app.get('/registrations', (req, res) => {
    const filePath = path.join(dataDir, 'registrations.json');
    res.sendFile(filePath);
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});