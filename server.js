const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = 3000;

// Cấu hình Middleware
// Bật CORS để cho phép Frontend gọi API mà không bị chặn
app.use(cors());
// Tăng giới hạn dung lượng lên 50MB vì ảnh chuyển sang chuỗi Base64 sẽ rất nặng
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Cấu hình để phục vụ file tĩnh (Frontend: index.html) 
// Khi truy cập http://localhost:3000 nó sẽ tự đọc file index.html cùng thư mục
app.use(express.static(__dirname));

// ==========================================
// MẢNG DỮ LIỆU TẠM THỜI (IN-MEMORY DATABASE)
// ==========================================
// Cấu trúc post: { id, author, image, caption, hearts, comments: [], timestamp }
let posts = [];

// Quản lý người dùng và bạn bè
// Cấu trúc: { "nam": { friends: ["nu"] }, "nu": { friends: ["nam"] } }
let users = {};

// ==========================================
// API ENDPOINTS
// ==========================================

// 1. Lấy danh sách bài đăng (Lọc theo bạn bè)
app.get('/api/posts', (req, res) => {
    const { username } = req.query;
    
    let allowedAuthors = [username]; // Luôn thấy bài của chính mình
    if (username && users[username]) {
        allowedAuthors = allowedAuthors.concat(users[username].friends);
    }

    // Lọc bài viết
    const filteredPosts = posts.filter(p => allowedAuthors.includes(p.author));
    // Sắp xếp bài đăng mới nhất lên đầu tiên
    const sortedPosts = filteredPosts.sort((a, b) => b.timestamp - a.timestamp);
    
    res.json({ success: true, data: sortedPosts });
});

// 2. Đăng một khoảnh khắc mới (POST /api/posts)
app.post('/api/posts', (req, res) => {
    const { image, caption, author } = req.body;

    if (!image) {
        return res.status(400).json({ success: false, message: 'Vui lòng cung cấp ảnh!' });
    }

    const newPost = {
        id: Date.now().toString(),
        author: author || 'Ẩn danh', // Lưu người đăng
        image: image,
        caption: caption || '',
        hearts: 0,
        comments: [],
        timestamp: Date.now()
    };

    posts.push(newPost);
    console.log(`[+] [${newPost.author}] đăng bài mới: ID ${newPost.id}`);
    res.json({ success: true, message: 'Đăng khoảnh khắc thành công!', post: newPost });
});

// 3. Thả tim bài viết (POST /api/posts/:id/heart)
app.post('/api/posts/:id/heart', (req, res) => {
    const postId = req.params.id;
    const post = posts.find(p => p.id === postId);

    if (!post) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy bài viết!' });
    }

    post.hearts += 1; // Tăng lượt tim lên 1
    console.log(`[<3] Bài viết ${postId} vừa được thả tim (Tổng: ${post.hearts})`);
    res.json({ success: true, hearts: post.hearts });
});

// 4. Bình luận vào bài viết (POST /api/posts/:id/comment)
app.post('/api/posts/:id/comment', (req, res) => {
    const postId = req.params.id;
    const { text, author } = req.body;

    if (!text || text.trim() === '') {
        return res.status(400).json({ success: false, message: 'Bình luận không được để trống!' });
    }

    const post = posts.find(p => p.id === postId);
    if (!post) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy bài viết!' });
    }

    const newComment = {
        id: Date.now().toString(),
        author: author || 'Ẩn danh',
        text: text.trim(),
        timestamp: Date.now()
    };

    post.comments.push(newComment);
    console.log(`[MSG] [${newComment.author}] bình luận ở bài ${postId}: ${text}`);
    res.json({ success: true, comment: newComment });
});

// ==========================================
// API USER & BẠN BÈ
// ==========================================

// Đăng nhập / Khởi tạo User
app.post('/api/users/login', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ success: false, message: 'Thiếu tên hiển thị' });
    
    // Nếu chưa có user thì tạo mới
    if (!users[username]) {
        users[username] = { friends: [] };
        console.log(`[USER] Tạo mới: ${username}`);
    }
    res.json({ success: true, username, friends: users[username].friends });
});

// Thêm bạn bè
app.post('/api/users/friend', (req, res) => {
    const { username, friendName } = req.body;
    
    if (!users[username]) return res.status(404).json({ success: false, message: "Bạn chưa đăng nhập!" });
    if (!users[friendName]) return res.status(404).json({ success: false, message: "Không tìm thấy người này (họ chưa từng mở ứng dụng)" });
    if (username === friendName) return res.status(400).json({ success: false, message: "Không thể tự kết bạn với chính mình" });
    
    // Kết bạn 2 chiều
    if (!users[username].friends.includes(friendName)) {
        users[username].friends.push(friendName);
    }
    if (!users[friendName].friends.includes(username)) {
        users[friendName].friends.push(username);
    }
    
    console.log(`[FRIEND] ${username} và ${friendName} đã thành bạn bè`);
    res.json({ success: true, message: `Đã kết bạn với ${friendName}!`, friends: users[username].friends });
});

// Lấy danh sách bạn bè
app.get('/api/users/:username/friends', (req, res) => {
    const { username } = req.params;
    if (!users[username]) return res.json({ success: true, friends: [] });
    res.json({ success: true, friends: users[username].friends });
});

// Khởi chạy Server
app.listen(PORT, () => {
    console.log(`🚀 Server backend đang chạy tại http://localhost:${PORT}`);
    console.log(`👉 Mở điện thoại cùng mạng WiFi và truy cập địa chỉ IP máy tính (VD: http://192.168.x.x:${PORT}) để trải nghiệm.`);
});
