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

app.use(express.static(path.join(__dirname, 'public'))); 
app.use(cookieParser());
app.use(express.urlencoded({ extended: true })); 
app.use(express.json()); 
app.set('trust proxy', 1);

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, 
        httpOnly: true,
    }
}));

app.use(fileUpload({
    useTempFiles: true,
    tempFileDir: TEMPFOLDER,
}));

app.use((req, res, next) => {
    if (req.path === '/login' || req.session.uid) {
        return next();
    }
    res.redirect('/login');
});

app.get('/login', (req, res) => {
    res.render('login', { layout: false });
});

app.post('/login', async (req, res) => {
    try {
        const { login, password } = req.body;
        const user = await db.findUser(login, password);

        if (!user) {
            return res.redirect('/login');
        }

        req.session.uid = user.id;
        req.session.name = user.name;

        const roles = (await db.get_roles(user.id)).map(obj => obj.ROLE);
        req.session.roles = roles;
        mlog(`Пользователь '${user.name}' вошел с ролями:`, roles);


        if (roles.includes('admin')) {
            return res.redirect('/requests');
        }
        return res.redirect('/');

    } catch (error) {
        mlog('Ошибка при авторизации:', error);
        res.redirect('/login');
    }
});

app.get('/', async (req, res) => {
    const requests = await db.getUserRequests(req.session.uid);
    res.render('user/index', {
        title: 'Мои заявки',
        requests,
        name: req.session.name,
        roles: req.session.roles 
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

app.get('/archive', async (req, res) => {
    const archive = await db.getArchiveRequests();
    res.render('admin/archive', { archive, name: req.session.name, roles: req.session.roles });
});

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