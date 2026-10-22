"use strict";
const token = localStorage.getItem("nextmovie_token");
const savedUser = JSON.parse(localStorage.getItem("nextmovie_user") || "null");
if (!token || !savedUser || savedUser.role !== "admin") location.replace("/auth.html?mode=admin");
const $ = id => document.getElementById(id);
function authHeaders(extra = {}) { return { ...extra, Authorization: `Bearer ${token}` }; }
async function refreshMovies() {
  try {
    const response = await fetch("/api/movies?sort=year");
    const movies = await response.json();
    if (!response.ok) throw new Error(movies.error || "Could not load movies.");
    $("adminMovieList").innerHTML = movies.filter(m => !String(m._id).startsWith("demo")).map(m => `<div class="admin-movie-row"><div><strong>${escapeHTML(m.title)}</strong><small>${escapeHTML(m.year || "Year unknown")} · ${escapeHTML(m.genre || "Movie")}</small></div><span>★ ${Number(m.rating || 0).toFixed(1)}</span></div>`).join("") || '<p class="muted-text">No database movies yet. Publish your first movie.</p>';
  } catch (error) { $("adminMovieList").textContent = error.message; }
}
function escapeHTML(value="") { return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
$("movieForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  const data = new FormData(form);
  data.set("year", Number(data.get("year") || new Date().getFullYear()));
  data.set("rating", Number(data.get("rating") || 0));
  button.disabled = true;
  $("adminMessage").textContent = "Publishing movie...";
  try {
    const response = await fetch("/api/movies", { method:"POST", headers:authHeaders(), body:data });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not publish movie.");
    $("adminMessage").textContent = "Movie published! It will now appear in the public catalogue.";
    form.reset();
    form.elements.year.value = new Date().getFullYear();
    form.elements.rating.value = "4.0";
    await refreshMovies();
  } catch (error) { $("adminMessage").textContent = error.message; }
  finally { button.disabled = false; }
});
$("refreshMovies").addEventListener("click", refreshMovies);
$("logoutBtn").addEventListener("click", () => { localStorage.removeItem("nextmovie_token"); localStorage.removeItem("nextmovie_user"); location.href = "/auth.html"; });
refreshMovies();