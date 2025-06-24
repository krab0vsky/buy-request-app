import {mlog,say,test} from './vendor/logs.js'
import { format } from 'date-fns';
var appDir = path.dirname(import.meta.url);
appDir = appDir.split('///')
appDir = appDir[1]
console.log(appDir);

process.on('uncaughtException', (err) => {
    mlog('Критическая ошибка! ', err.stack);
});

import express from 'express'
import exphbs from 'express-handlebars'
import fileUpload from 'express-fileupload'
import session from 'express-session'
import cookieParser from 'cookie-parser'
import path from 'path'
import fs from 'fs-extra'
import 'dotenv/config'
import * as db from './vendor/db.mjs';
import * as hlp from './vendor/hlp.mjs';
import { type } from 'os';

const app = express();
const hbs = exphbs.create({
defaultLayout: 'main',
extname: 'hbs',
});

const TEMPFOLDER = path.join(appDir,'public/temp');

app.engine('hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', 'views');

if (test){
    app.use(express.static(path.join(appDir, 'public')));
    app.set('views', 'views');
} else {
    app.use(express.static(path.join('//',appDir, 'public')));
    app.set('views',path.join('//',appDir, 'views'));
}

console.log(path.join(appDir, 'public'));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
//app.use(fileupload());
app.set('trust proxy', 1);

app.use(session({resave:true,saveUninitialized:false, secret: 'keyboard cat', cookie: 
    {secure: false, // обязательно false на HTTPS
    httpOnly: true}
}));
app.use(fileUpload({
    useTempFiles : true,
    tempFileDir : TEMPFOLDER,
    defCharset: 'utf8',
    defParamCharset: 'utf8'
}));

app.use(express.json()); // для application/json

app.post('/data', async (req, res) => {
    // console.log(req.body)
    req.session.info = req.body
    res.send('ok')
})

app.post('/datas', async (req, res) => {
    console.log(req.body)
    req.session.info = req.body
    res.send('ok')
})

app.get('/', async (req, res) => {
    //user,manager,admin
    let roles = await db.get_roles(req.session.uid)
    roles = roles.map(obj => obj.ROLE)
    mlog(roles)
    req.session.roles = roles
    res.render('index', {
        title: 'Прогресс репорт',
        roles: req.session.roles,
        name: req.session.name,
        uid: req.session.uid
    })
})

// Авторизация
app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', async (req, res) => {
    // Логика авторизации и определения роли
    const { login, password } = req.body;
    const user = await db.findUser(login, password);
    if (!user) return res.redirect('/login');

    req.session.uid = user.id;
    req.session.name = user.name;
    req.session.role = user.role;

    if (user.role === 'admin') return res.redirect('/requests');
    return res.redirect('/');
});

// Пользовательские заявки
app.get('/', async (req, res) => {
    const requests = await db.getUserRequests(req.session.uid);
    res.render('user/index', { requests });
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

// Админские заявки
app.get('/requests', async (req, res) => {
    const allRequests = await db.getAllRequests();
    res.render('admin/requests', { allRequests });
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
    res.render('admin/archive', { archive });
});

// Пользователи (только для админа)
app.get('/users', async (req, res) => {
    const users = await db.getUsersWithStats();
    res.render('admin/users', { users });
});

app.get('/users/:id', async (req, res) => {
    const requests = await db.getRequestsByUser(req.params.id);
    res.render('admin/user-requests', { requests });
});

app.post('/users/:id/update', async (req, res) => {
    await db.updateUser(req.params.id, req.body);
    res.redirect('/users');
});

app.post('/users/:id/delete', async (req, res) => {
    await db.deleteUser(req.params.id);
    res.redirect('/users');
});

async function start(){
    app.listen(process.env.PORT, ()=> {
        mlog('Server has been started...')
        mlog('Порт: ',process.env.PORT)
    })
}

await start()