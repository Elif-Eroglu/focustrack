"use client";

import { useState } from "react";
import Link from "next/link";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const response = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Giriş başarısız");
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      window.location.replace("/dashboard");
    } catch (error) {
      console.error(error);
      setMessage("Sunucuya bağlanılamadı");
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100 text-slate-900">
      <div className="w-full max-w-md bg-white border border-slate-200 p-8 rounded-2xl shadow-sm">
        <h1 className="text-3xl font-bold mb-2 text-center">
          FocusTrack
        </h1>

        <p className="text-slate-500 text-center mb-6">
          Hesabına giriş yap
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block mb-1 font-medium">
              E-posta
            </label>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-slate-300 px-4 py-3 rounded-xl"
              required
            />
          </div>

          <div>
            <label className="block mb-1 font-medium">
              Şifre
            </label>

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-slate-300 px-4 py-3 rounded-xl"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full bg-slate-900 text-white py-3 rounded-xl font-medium"
          >
            Giriş Yap
          </button>
        </form>

        {message && (
          <p className="mt-4 text-center text-sm text-slate-600">
            {message}
          </p>
        )}

        <p className="mt-6 text-center text-sm text-slate-500">
          Hesabın yok mu?{" "}
          <Link
            href="/register"
            className="font-semibold text-slate-900 hover:underline"
          >
            Kayıt Ol
          </Link>
        </p>
      </div>
    </main>
  );
}