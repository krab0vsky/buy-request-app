import mysql from 'mysql2'
import 'dotenv/config';
import { mlog } from './logs.js';

const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  charset: process.env.DB_CHARSET
});

try {
  await connection.connect();
  mlog('Успешное подключение к базе данных');
} catch (err) {
  mlog('Ошибка подключения к базе данных:', err.message);
  process.exit(1); 
}

// Авторизация
export async function findUser(login, password) {
  const [rows] = await connection.execute(
    'SELECT * FROM users WHERE login = ? AND password = ?',
    [login, password]
  );
  return rows[0];
}

// Заявки текущего пользователя
export async function getUserRequests(userId) {
  const [rows] = await connection.execute(
    'SELECT * FROM requests WHERE user_id = ?',
    [userId]
  );
  return rows;
}

// Создание новой заявки
export async function createRequest(userId, data) {
  const { title, quantity, price, link, desired_date } = data;
  await connection.execute(
    `INSERT INTO requests
     (user_id, title, quantity, price, link, desired_date, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'На рассмотрении', NOW(), NOW())`,
    [userId, title, quantity, price, link, desired_date]
  );
}

// Получение заявки, если она принадлежит пользователю
export async function getRequestIfOwned(requestId, userId) {
  const [rows] = await connection.execute(
    'SELECT * FROM requests WHERE id = ? AND user_id = ?',
    [requestId, userId]
  );
  return rows[0];
}

// Обновление заявки, если она принадлежит пользователю
export async function updateRequestIfOwned(id, userId, data) {
  const { title, quantity, price, link, desired_date } = data;
  await connection.execute(
    `UPDATE requests
     SET title = ?, quantity = ?, price = ?, link = ?, desired_date = ?, updated_at = NOW()
     WHERE id = ? AND user_id = ?`,
    [title, quantity, price, link, desired_date, id, userId]
  );
}
// Получить все заявки (с опциональным фильтром)
export async function getAllRequests(filter = {}) {
  let sql = 'SELECT * FROM requests';
  const params = [];

  if (filter.status) {
    sql += ' WHERE status = ?';
    params.push(filter.status);
  }

  if (filter.user_id) {
    if (params.length === 0) {
      sql += ' WHERE user_id = ?';
    } else {
      sql += ' AND user_id = ?';
    }
    params.push(filter.user_id);
  }

  const [rows] = await connection.execute(sql, params);
  return rows;
}

// Полное обновление заявки (для админа)
export async function updateRequestFull(id, data) {
const { title, quantity, price, link, desired_date, delivery_date, status, comment } = data;
await connection.execute(
  `UPDATE requests SET title = ?, quantity = ?, price = ?, link = ?, 
    desired_date = ?, delivery_date = ?, status = ?, comment = ?, updated_at = NOW()
   WHERE id = ?`,
  [title, quantity, price, link, desired_date, delivery_date, status, comment, id]
);
}

// Массовое обновление статусов
export async function massUpdateStatuses(ids, status) {
  const placeholders = ids.map(() => '?').join(',');
  await connection.execute(
    `UPDATE requests SET status = ? WHERE id IN (${placeholders})`,
    [status, ...ids]
  );
}

// Заявки со статусом "получен" (архив)
export async function getArchiveRequests() {
  const [rows] = await connection.execute(
    'SELECT * FROM requests WHERE status = "получен"'
  );
  return rows;
}

// Все пользователи с количеством заявок
export async function getUsersWithStats() {
  const [rows] = await connection.execute(`
    SELECT users.id, users.name, COUNT(r.id) AS request_count
    FROM users
    LEFT JOIN requests r ON users.id = r.user_id
    GROUP BY users.id
  `);
  return rows;
}

// Заявки по пользователю (для админа)
export async function getRequestsByUser(userId) {
  const [rows] = await connection.execute(
    'SELECT * FROM requests WHERE user_id = ?',
    [userId]
  );
  return rows;
}

// Обновление пользователя
export async function updateUser(userId, data) {
  const { name, login, password } = data;
  await connection.execute(
    'UPDATE users SET name = ?, login = ?, password = ? WHERE id = ?',
    [name, login, password, userId]
  );
}

// Удаление пользователя
export async function deleteUser(userId) {
  await connection.execute(
    'DELETE FROM users WHERE id = ?',
    [userId]
  );
}

