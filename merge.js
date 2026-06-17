const fs = require('fs');

try {
    const serverCode = fs.readFileSync('server.js', 'utf8');
    const htmlCode = fs.readFileSync('index.html', 'utf8');

    let newServerCode = serverCode.replace("app.use(express.static(__dirname));", "");

    // Cần escape để có thể nhúng vào chuỗi template literal
    const escapedHtml = htmlCode
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\$/g, '\\$');

    const finalCode = `
${newServerCode}

// ==========================================
// FRONTEND BẢN GỘP (HTML + CSS + JS)
// ==========================================
const HTML_CONTENT = \`${escapedHtml}\`;

app.get('/', (req, res) => {
    res.send(HTML_CONTENT);
});
`;

    fs.writeFileSync('fakeLocket.js', finalCode);
    console.log("Merged successfully.");
} catch (e) {
    console.error("Error:", e);
}
