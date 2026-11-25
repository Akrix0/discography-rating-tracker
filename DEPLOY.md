# Покрокова інструкція: Turso (БД) + GitHub + Render (безкоштовний деплой)

Усе налаштовується **100% безкоштовно, без банківської картки** приблизно за 5–10 хвилин.

---

## Крок 1. Створення віддаленої бази даних **Turso** (5 ГБ безкоштовно)
1. Відкрийте [https://turso.tech](https://turso.tech) та натисніть **Sign Up** → увійдіть через ваш **GitHub**-акаунт.
2. Натисніть **Create Database** (або **Add Database**):
   - **Database Name**: `discography-tracker`
   - **Region / Location**: оберіть найближчий до Європи, наприклад **`Frankfurt (fra)`** (щоб був мінімальний пінг до Render).
   - Натисніть **Create**.
3. Відкрийте щойно створену базу та скопіюйте **Database URL** (має вигляд `libsql://discography-tracker-вашнік.turso.io`).
4. Натисніть **Create Token** (або **Generate Token**):
   - **Expiration**: `Never` (безстроковий)
   - **Permissions**: `Read & Write`
   - Скопіюйте **Auth Token** (довгий рядок) та збережіть його в блокноті разом із URL — токен показується лише один раз!

---

## Крок 2. Завантаження проєкту на **GitHub**
1. Зайдіть на [https://github.com/new](https://github.com/new).
2. Введіть назву репозиторію (наприклад, `discography-rating-tracker`), оберіть **Private** (приватний) або **Public** і натисніть **Create repository** (не додавайте README чи .gitignore на GitHub — вони вже є у папці!).
3. Відкрийте **PowerShell** на вашому комп'ютері та виконайте по черзі:
   ```powershell
   cd "C:\Users\Admin\Desktop\Discography & Rating Tracker"
   ```
   *(Якщо ви ще ніколи не користувалися Git на цьому ПК, задайте своє ім'я та пошту — 1 раз):*
   ```powershell
   git config --global user.name "Ваше Ім'я"
   git config --global user.email "ваша.пошта@example.com"
   ```
   Тепер ініціалізуйте та запуште код на GitHub (підставте своє посилання з GitHub):
   ```powershell
   git init
   git add .
   git commit -m "Initial deploy: multi-artist tracker with Turso & auth"
   git branch -M main
   git remote add origin https://github.com/ВАШ_ЛОГІН/discography-rating-tracker.git
   git push -u origin main
   ```
   *(Коли Git попросить авторизацію — увійде браузерне вікно GitHub, натисніть **Authorize**).*

---

## Крок 3. Безкоштовний деплой на **Render.com**
1. Зайдіть на [https://render.com](https://render.com) → натисніть **Get Started for Free** → увійдіть через **GitHub**.
2. На панелі Render натисніть **New +** → **Blueprint** (або **Web Service**):
   - Якщо через **Blueprint**: оберіть ваш репозиторій `discography-rating-tracker` — Render автоматично прочитає файл `render.yaml`, попросить ввести `TURSO_DATABASE_URL` та `TURSO_AUTH_TOKEN`, і сам згенерує `ENCRYPTION_KEY`.
   - Якщо через **New + → Web Service** вручну:
     - **Repository**: оберіть `discography-rating-tracker`
     - **Region**: `Frankfurt (EU Central)`
     - **Branch**: `main`
     - **Runtime**: `Node`
     - **Build Command**: `npm install --include=dev && npm run build`
     - **Start Command**: `npm start`
     - **Instance Type**: `Free`
     - У блоці **Environment Variables** додайте:
       - `NODE_ENV` = `production`
       - `TURSO_DATABASE_URL` = ваш `libsql://...` URL із Кроку 1
       - `TURSO_AUTH_TOKEN` = ваш токен із Кроку 1
       - `ENCRYPTION_KEY` = будь-який ваш довгий секретний ключ (або згенеруйте 64 символи командою `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
3. Натисніть **Create Web Service** (або **Apply**).
4. Зачекайте 2–3 хвилини, поки Render збере проєкт та покаже зелений статус **`Live`**.
5. Відкрийте ваше посилання виду `https://discography-rating-tracker.onrender.com`, натисніть **«Реєстрація»**, створіть власний акаунт — і готово!

> **Примітка про Free-план Render**: після 15 хвилин повної тиші сервер засинає й при першому заході прокидається за ~25–40 секунд. Усі ваші оцінки, нотатки й виконавці надійно живуть у **Turso** і не зникають ніколи.
