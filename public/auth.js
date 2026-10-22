"use strict";
const $ = id => document.getElementById(id);
let mode = new URLSearchParams(location.search).get("mode") || "login";
function setMode(next) {
  mode = next;
  $("nameWrap").hidden = mode !== "register";
  $("nameInput").required = mode === "register";
  $("loginTab").classList.toggle("active", mode === "login");
  $("registerTab").classList.toggle("active", mode === "register");
  $("adminTab").classList.toggle("active", mode === "admin");
  $("submitAuth").textContent = mode === "register" ? "Create account" : mode === "admin" ? "Admin login" : "Login";
  $("authHeading").innerHTML = mode === "register" ? "Join the movie<br><span>community.</span>" : mode === "admin" ? "Manage your<br><span>movie library.</span>" : "Your movie journey<br><span>starts here.</span>";
  $("passwordInput").autocomplete = mode === "register" ? "new-password" : "current-password";
  $("authMessage").textContent = "";
}
$("loginTab").addEventListener("click", () => setMode("login"));
$("registerTab").addEventListener("click", () => setMode("register"));
$("adminTab").addEventListener("click", () => setMode("admin"));
$("authForm").addEventListener("submit", async event => {
  event.preventDefault();
  const button = $("submitAuth"); button.disabled = true;
  $("authMessage").textContent = "Please wait...";
  const body = { email: $("emailInput").value.trim(), password: $("passwordInput").value };
  if (mode === "register") body.name = $("nameInput").value.trim();
  try {
    const response = await fetch(mode === "register" ? "/api/auth/register" : "/api/auth/login", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Authentication failed.");
    if (mode === "admin" && data.user.role !== "admin") throw new Error("This account is not an administrator.");
    localStorage.setItem("nextmovie_token", data.token);
    localStorage.setItem("nextmovie_user", JSON.stringify(data.user));
    location.href = data.user.role === "admin" ? "/admin.html" : "/";
  } catch (error) { $("authMessage").textContent = error.message; }
  finally { button.disabled = false; }
});
setMode(mode === "admin" ? "admin" : mode === "register" ? "register" : "login");