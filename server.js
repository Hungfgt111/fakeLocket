const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

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
// CƠ SỞ DỮ LIỆU TỆP TIN (FILE-BASED DATABASE)
// ==========================================
const dbPath = path.join(__dirname, 'db.json');
let db = { users: {}, posts: [], friendRequests: [] };

if (fs.existsSync(dbPath)) {
    try {
        db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    } catch (e) {
        console.error("Lỗi đọc db.json, khởi tạo database trống:", e);
    }
}

let users = db.users || {};
let posts = db.posts || [];
let friendRequests = db.friendRequests || [];

function saveDb() {
    try {
        db.users = users;
        db.posts = posts;
        db.friendRequests = friendRequests;
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 4), 'utf8');
    } catch (e) {
        console.error("Lỗi lưu file db.json:", e);
    }
}

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
    saveDb();
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
    saveDb();
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
    saveDb();
    console.log(`[MSG] [${newComment.author}] bình luận ở bài ${postId}: ${text}`);
    res.json({ success: true, comment: newComment });
});

// 5. Xóa bài viết (DELETE /api/posts/:id)
app.delete('/api/posts/:id', (req, res) => {
    const postId = req.params.id;
    const { username } = req.query; // Xác nhận xem ai là người đang yêu cầu xóa

    const postIndex = posts.findIndex(p => p.id === postId);
    if (postIndex === -1) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy bài viết!' });
    }

    // Chỉ người đăng bài mới được xóa
    if (posts[postIndex].author !== username) {
        return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa ảnh của người khác!' });
    }

    posts.splice(postIndex, 1);
    saveDb();
    console.log(`[DEL] ${username} đã gỡ bài viết ${postId}`);
    res.json({ success: true, message: 'Đã gỡ bài viết!' });
});

// ==========================================
// API USER & BẠN BÈ (HỆ THỐNG LỜI MỜI)
// ==========================================

// Lời mời kết bạn đang chờ xử lý (đã lấy từ db.json)
// let friendRequests = db.friendRequests || [];

// Đăng nhập / Khởi tạo User / Bảo mật Mật khẩu
app.post('/api/users/login', (req, res) => {
    const { username, password } = req.body;
    if (!username) return res.status(400).json({ success: false, message: 'Thiếu tên hiển thị' });
    if (!password) return res.status(400).json({ success: false, message: 'Thiếu mật khẩu' });
    
    if (!users[username]) {
        // Tự động đăng ký nếu tài khoản mới
        users[username] = { password: password, friends: [] };
        saveDb();
        console.log(`[USER] Tạo mới tài khoản: ${username}`);
        const pendingCount = friendRequests.filter(r => r.to === username).length;
        return res.json({ success: true, username, friends: [], pendingCount, message: "Tạo tài khoản mới thành công!" });
    }
    
    // Nếu tài khoản đã tồn tại, kiểm tra mật khẩu
    if (users[username].password !== password) {
        return res.status(401).json({ success: false, message: 'Sai mật khẩu tài khoản! Vui lòng nhập lại.' });
    }
    
    // Đếm số lời mời đang chờ
    const pendingCount = friendRequests.filter(r => r.to === username).length;
    res.json({ success: true, username, friends: users[username].friends, pendingCount });
});

// Gửi lời mời kết bạn
app.post('/api/users/friend/request', (req, res) => {
    const { username, friendName, message } = req.body;
    
    if (!users[username]) return res.status(404).json({ success: false, message: "Bạn chưa đăng nhập!" });
    if (!users[friendName]) return res.status(404).json({ success: false, message: "Không tìm thấy người này (họ chưa từng mở ứng dụng)" });
    if (username === friendName) return res.status(400).json({ success: false, message: "Không thể tự kết bạn với chính mình" });
    
    // Kiểm tra đã là bạn bè chưa
    if (users[username].friends.includes(friendName)) {
        return res.status(400).json({ success: false, message: `Bạn và ${friendName} đã là bạn bè rồi!` });
    }
    
    // Kiểm tra đã gửi lời mời trước đó chưa
    const existingRequest = friendRequests.find(r => r.from === username && r.to === friendName);
    if (existingRequest) {
        return res.status(400).json({ success: false, message: "Bạn đã gửi lời mời rồi, hãy đợi họ chấp nhận!" });
    }
    
    // Kiểm tra nếu đối phương đã gửi lời mời cho mình → tự động chấp nhận
    const reverseRequest = friendRequests.find(r => r.from === friendName && r.to === username);
    if (reverseRequest) {
        // Chấp nhận luôn
        friendRequests = friendRequests.filter(r => !(r.from === friendName && r.to === username));
        if (!users[username].friends.includes(friendName)) users[username].friends.push(friendName);
        if (!users[friendName].friends.includes(username)) users[friendName].friends.push(username);
        saveDb();
        console.log(`[FRIEND] ${username} và ${friendName} đã thành bạn bè (tự động chấp nhận lời mời ngược)`);
        return res.json({ success: true, message: `${friendName} cũng đã gửi lời mời cho bạn. Hai bạn giờ là bạn bè!`, friends: users[username].friends });
    }
    
    friendRequests.push({ from: username, to: friendName, message: message || '', timestamp: Date.now() });
    saveDb();
    console.log(`[REQUEST] ${username} gửi lời mời kết bạn tới ${friendName} với lời nhắn: "${message || ''}"`);
    res.json({ success: true, message: `Đã gửi lời mời kết bạn tới ${friendName}! Đợi họ chấp nhận nhé.` });
});

// Lấy danh sách lời mời đang chờ (người khác gửi cho mình)
app.get('/api/users/:username/requests', (req, res) => {
    const { username } = req.params;
    const pending = friendRequests.filter(r => r.to === username).map(r => ({
        from: r.from,
        message: r.message || '',
        timestamp: r.timestamp
    }));
    res.json({ success: true, requests: pending });
});

// Chấp nhận lời mời kết bạn
app.post('/api/users/friend/accept', (req, res) => {
    const { username, fromUser } = req.body;
    
    const reqIndex = friendRequests.findIndex(r => r.from === fromUser && r.to === username);
    if (reqIndex === -1) {
        return res.status(404).json({ success: false, message: "Không tìm thấy lời mời này!" });
    }
    
    // Xóa lời mời và thêm bạn bè 2 chiều
    friendRequests.splice(reqIndex, 1);
    if (!users[username].friends.includes(fromUser)) users[username].friends.push(fromUser);
    if (users[fromUser] && !users[fromUser].friends.includes(username)) users[fromUser].friends.push(username);
    saveDb();
    
    console.log(`[ACCEPT] ${username} chấp nhận lời mời từ ${fromUser}`);
    res.json({ success: true, message: `Đã chấp nhận! Bạn và ${fromUser} giờ là bạn bè.`, friends: users[username].friends });
});

// Từ chối lời mời kết bạn
app.post('/api/users/friend/reject', (req, res) => {
    const { username, fromUser } = req.body;
    
    friendRequests = friendRequests.filter(r => !(r.from === fromUser && r.to === username));
    saveDb();
    
    console.log(`[REJECT] ${username} từ chối lời mời từ ${fromUser}`);
    res.json({ success: true, message: `Đã từ chối lời mời từ ${fromUser}.` });
});

// Lấy danh sách bạn bè
app.get('/api/users/:username/friends', (req, res) => {
    const { username } = req.params;
    if (!users[username]) return res.json({ success: true, friends: [] });
    res.json({ success: true, friends: users[username].friends });
});

// ==========================================
// API ADMIN QUẢN LÝ
// ==========================================

// Lấy danh sách tất cả user
app.get('/api/admin/users', (req, res) => {
    const userList = Object.keys(users).map(username => {
        return {
            username: username,
            friendCount: users[username].friends.length,
            postCount: posts.filter(p => p.author === username).length
        };
    });
    res.json({ success: true, users: userList });
});

// Xóa một user
app.delete('/api/admin/users/:username', (req, res) => {
    const { username } = req.params;
    if (!users[username]) return res.status(404).json({ success: false, message: 'User không tồn tại!' });
    
    // Xóa user khỏi db
    delete users[username];
    
    // Xóa user khỏi danh sách bạn bè của người khác
    Object.keys(users).forEach(u => {
        users[u].friends = users[u].friends.filter(f => f !== username);
    });
    
    // Xóa toàn bộ bài đăng của user
    posts = posts.filter(p => p.author !== username);
    
    saveDb();
    
    console.log(`[ADMIN] Đã xóa toàn bộ dữ liệu của người dùng: ${username}`);
    res.json({ success: true, message: `Đã xóa ${username} thành công!` });
});

// Khởi chạy Server
app.listen(PORT, () => {
    console.log(`🚀 Server backend đang chạy tại http://localhost:${PORT}`);
    console.log(`👉 Mở điện thoại cùng mạng WiFi và truy cập địa chỉ IP máy tính (VD: http://192.168.x.x:${PORT}) để trải nghiệm.`);
});
