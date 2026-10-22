# MovieFlix — MongoDB Movie Recommendation Website

A dark, cinematic movie catalog built with HTML/CSS/JavaScript, Node.js, Express and MongoDB.

## Run on Windows (VS Code)

1. Extract the ZIP and open the `MovieFlix_MongoDB` folder in VS Code.
2. Install Node.js if you haven't already.
3. Open Terminal > New Terminal and run:
   ```powershell
   npm install
   ```
4. Optional: connect MongoDB Atlas:
   - Copy `.env.example` to a new file named `.env`.
   - Replace `MONGODB_URI` with your own Atlas connection string. Replace the username/password placeholders and database name as needed.
   - In Atlas, add your current IP to Network Access and create a database user.
   - Do not share or upload your `.env` file.
5. Start:
   ```powershell
   npm run dev
   ```
   Or use `npm start`.
6. Open http://localhost:5000

## Features
- Cinematic responsive dark theme
- Movie cards with poster, title, genre, year and rating
- Live search by title, genre and language
- Genre filters and sort by rating/year
- MongoDB movie schema and index
- API routes to list/add movies and update a rating
- Demo movie catalog works even before MongoDB is connected

## Add a movie to MongoDB
After connecting MongoDB, send a POST request to `http://localhost:5000/api/movies` with JSON:
```json
{
  "title": "Example Movie",
  "year": 2025,
  "genre": "Drama",
  "rating": 4.4,
  "description": "A short description.",
  "poster": "https://example.com/poster.jpg",
  "language": "Hindi"
}
```
Use Postman or VS Code REST Client. The endpoint expects JSON.

Note: Demo catalogue data is shown as a fallback. Ratings can only be saved for actual MongoDB documents.


## Login, registration and admin movie uploads
- Configure `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `TOKEN_SECRET` in `.env` (never commit `.env`).
- User registration and user accounts require MongoDB to be connected. Passwords are stored as scrypt hashes.
- Open `/auth.html` for user login/register. Open `/auth.html?mode=admin` for admin login.
- Admin can publish movies at `/admin.html`; uploaded movie records are stored in MongoDB and appear in the public catalogue.
- Movie posters are entered as image URLs; this build does not upload image files to the server.
