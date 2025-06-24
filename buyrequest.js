import { mlog } from './vendor/logs.js';
import { fileURLToPath } from 'url';
import express from 'express';
import exphbs from 'express-handlebars';
import fileUpload from 'express-fileupload';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import path from 'path';
import 'dotenv/config';
import * as db from './vendor/db.mjs';
import mysql from 'mysql2';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPFOLDER = path.join(__dirname, 'public/temp');
const PORT = process.env.PORT || 3000;

process.on('uncaughtException', (err) => {
    mlog('Критическая ошибка! ', err.stack);
});

const app = express();
const hbs = exphbs.create({
    defaultLayout: 'main',
    extname: 'hbs',
});


app.engine('hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// --- 4. MIDDLEWARE (ПРОМЕЖУТОЧНОЕ ПО) ---
app.use(express.static(path.join(__dirname, 'public'))); // Раздача статики (css, js, images)
app.use(cookieParser());
app.use(express.urlencoded({ extended: true })); // Для парсинга форм
app.use(express.json()); // Для парсинга JSON-запросов
app.set('trust proxy', 1);

app.use(session({
    secret: 'a very secret key should be here',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // На локальном сервере (http) должно быть false
        httpOnly: true,
    }
}));

app.use(fileUpload({
    useTempFiles: true,
    tempFileDir: TEMPFOLDER,
}));

// Middleware для проверки авторизации на всех страницах, кроме /login
app.use((req, res, next) => {
    if (req.path === '/login' || req.session.uid) {
        // Если пользователь на странице логина или уже авторизован, пропускаем дальше
        return next();
    }
    // В остальных случаях - перенаправляем на логин
    res.redirect('/login');
});


// --- 5. МАРШРУТЫ ПРИЛОЖЕНИЯ ---

// -- Авторизация --
app.get('/login', (req, res) => {
    // Используем layout: false, чтобы для страницы входа не применялся основной шаблон
    res.render('login', { layout: false });
});

app.post('/login', async (req, res) => {
    try {
        const { login, password } = req.body;
        const user = await db.findUser(login, password);

        if (!user) {
            // Можно добавить сообщение об ошибке
            return res.redirect('/login');
        }

        // Сохраняем данные пользователя в сессию
        req.session.uid = user.id;
        req.session.name = user.name;

        // Получаем роли пользователя и сохраняем их в сессию
        const roles = (await db.get_roles(user.id)).map(obj => obj.ROLE);
        req.session.roles = roles;
        mlog(`Пользователь '${user.name}' вошел с ролями:`, roles);

        // Перенаправляем в зависимости от роли
        if (roles.includes('admin')) {
            return res.redirect('/requests');
        }
        return res.redirect('/');

    } catch (error) {
        mlog('Ошибка при авторизации:', error);
        res.redirect('/login');
    }
});

// -- Маршруты для обычного пользователя --
app.get('/', async (req, res) => {
    const requests = await db.getUserRequests(req.session.uid);
    res.render('user/index', {
        title: 'Мои заявки',
        requests,
        name: req.session.name,
        roles: req.session.roles // Роли уже есть в сессии
    });
});

app.get('/create', (req, res) => {
    res.render('user/create');
});

app.post('/create', async (req, res) => {
    await db.createRequest(req.session.uid, req.body);
    res.redirect('/');
});

app.get('/edit/:id', async (req, res) => {
    const request = await db.getRequestIfOwned(req.params.id, req.session.uid);
    res.render('user/edit', { request });
});

app.post('/edit/:id', async (req, res) => {
    await db.updateRequestIfOwned(req.params.id, req.session.uid, req.body);
    res.redirect('/');
});

app.post('/clone/:id', async (req, res) => {
    await db.cloneRequest(req.params.id, req.session.uid);
    res.redirect('/');
});


// -- Маршруты для админа (TODO: добавить проверку роли 'admin') --
app.get('/requests', async (req, res) => {
    const allRequests = await db.getAllRequests();
    res.render('admin/requests', { allRequests, name: req.session.name, roles: req.session.roles });
});

app.post('/requests/update/:id', async (req, res) => {
    await db.updateRequestFull(req.params.id, req.body);
    res.redirect('/requests');
});

app.post('/requests/mass-update', async (req, res) => {
    const { ids, status } = req.body;
    await db.massUpdateStatuses(ids, status);
    res.redirect('/requests');
});

// Архив
app.get('/archive', async (req, res) => {
    const archive = await db.getArchiveRequests();
    res.render('admin/archive', { archive, name: req.session.name, roles: req.session.roles });
});

// Пользователи
app.get('/users', async (req, res) => {
    const users = await db.getUsersWithStats();
    res.render('admin/users', { users, name: req.session.name, roles: req.session.roles });
});

app.get('/users/:id', async (req, res) => {
    const requests = await db.getRequestsByUser(req.params.id);
    res.render('admin/user-requests', { requests, name: req.session.name, roles: req.session.roles });
});

app.post('/users/:id/update', async (req, res) => {
    await db.updateUser(req.params.id, req.body);
    res.redirect('/users');
});

app.post('/users/:id/delete', async (req, res) => {
    await db.deleteUser(req.params.id);
    res.redirect('/users');
});


async function start() {
    try {
        app.listen(process.env.PORT, () => {
            mlog(`Сервер успешно запущен на порту ${process.env.PORT}`);
        });
    } catch (e) {
        mlog('Ошибка при запуске сервера:', e);
    }
}

start();