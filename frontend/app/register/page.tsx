"use client";

import { useState } from "react";
import Link from "next/link";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const registerResponse = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          password,
        }),
      });

      const registerData = await registerResponse.json();

      if (!registerResponse.ok) {
        setMessage(registerData.message || "Kayıt başarısız");
        return;
      }

      const loginResponse = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const loginData = await loginResponse.json();

      if (!loginResponse.ok) {
        setMessage("Kayıt oluşturuldu fakat giriş yapılamadı.");
        return;
      }

      localStorage.setItem("token", loginData.token);
      localStorage.setItem(
        "user",
        JSON.stringify(loginData.user)
      );

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
          Yeni hesap oluştur
        </p>

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block mb-1 font-medium">
              İsim
            </label>

            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-slate-300 px-4 py-3 rounded-xl"
              required
            />
          </div>

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
            Kayıt Ol
          </button>
        </form>

        {message && (
          <p className="mt-4 text-center text-sm text-slate-600">
            {message}
          </p>
        )}

        <p className="mt-6 text-center text-sm text-slate-500">
          Zaten hesabın var mı?{" "}
          <Link
            href="/login"
            className="font-semibold text-slate-900 hover:underline"
          >
            Giriş Yap
          </Link>
        </p>
      </div>
    </main>
  );
}