"use client";

import { useEffect, useMemo, useState } from "react";

type Task = {
  id: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
};

type FocusData = {
  active: boolean;
  focus?: {
    taskId: number;
    sessionId?: number;
    startedAt: string;
  };
  remainingSeconds?: number;
};

type FocusHistoryItem = {
  id: number;
  task_id: number;
  task_title: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
};

export default function DashboardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const [focusTaskId, setFocusTaskId] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const [focusHistory, setFocusHistory] = useState<FocusHistoryItem[]>([]);

  const getToken = () => localStorage.getItem("token");

  const fetchTasks = async () => {
    const token = getToken();
    if (!token) return;

    try {
      const response = await fetch("http://localhost:5000/tasks", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Görevler alınamadı");
        return;
      }

      setTasks(data);
    } catch (error) {
      console.error(error);
      setMessage("Sunucuya bağlanılamadı");
    }
  };

  const fetchFocus = async () => {
    const token = getToken();
    if (!token) return;

    try {
      const response = await fetch("http://localhost:5000/focus", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data: FocusData = await response.json();

      if (!response.ok) return;

      if (data.active && data.focus && data.remainingSeconds) {
        setFocusTaskId(data.focus.taskId);
        setRemainingSeconds(data.remainingSeconds);
      } else {
        setFocusTaskId(null);
        setRemainingSeconds(0);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const fetchFocusHistory = async () => {
    const token = getToken();
    if (!token) return;

    try {
      const response = await fetch("http://localhost:5000/focus/history", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Odak geçmişi alınamadı");
        return;
      }

      setFocusHistory(data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();

    const token = getToken();
    if (!token) return;

    try {
      const response = await fetch("http://localhost:5000/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Görev eklenemedi");
        return;
      }

      setTitle("");
      setMessage("Görev başarıyla eklendi.");
      fetchTasks();
    } catch (error) {
      console.error(error);
      setMessage("Sunucuya bağlanılamadı");
    }
  };

  const handleDelete = async (taskId: number) => {
    const token = getToken();
    if (!token) return;

    try {
      const response = await fetch(
        `http://localhost:5000/tasks/${taskId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Görev silinemedi");
        return;
      }

      setMessage("Görev silindi.");
      fetchTasks();
    } catch (error) {
      console.error(error);
      setMessage("Sunucuya bağlanılamadı");
    }
  };

  const handleStatusChange = async (
    taskId: number,
    currentStatus: string
  ) => {
    const token = getToken();
    if (!token) return;

    let newStatus = "To Do";

    if (currentStatus === "To Do") {
      newStatus = "In Progress";
    } else if (currentStatus === "In Progress") {
      newStatus = "Done";
    }

    try {
      const response = await fetch(
        `http://localhost:5000/tasks/${taskId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: newStatus }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Görev güncellenemedi");
        return;
      }

      setMessage("Görev durumu güncellendi.");
      fetchTasks();
    } catch (error) {
      console.error(error);
      setMessage("Sunucuya bağlanılamadı");
    }
  };

  const handlePriorityChange = async (
    taskId: number,
    newPriority: string
  ) => {
    const token = getToken();
    if (!token) return;

    try {
      const response = await fetch(
        `http://localhost:5000/tasks/${taskId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ priority: newPriority }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Öncelik güncellenemedi");
        return;
      }

      setMessage("Öncelik güncellendi.");
      fetchTasks();
    } catch (error) {
      console.error(error);
      setMessage("Sunucuya bağlanılamadı");
    }
  };

  const startEditing = (task: Task) => {
    setEditingTaskId(task.id);
    setEditingTitle(task.title);
  };

  const cancelEditing = () => {
    setEditingTaskId(null);
    setEditingTitle("");
  };

  const saveEdit = async (taskId: number) => {
    const token = getToken();

    if (!token || editingTitle.trim() === "") return;

    try {
      const response = await fetch(
        `http://localhost:5000/tasks/${taskId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: editingTitle,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Görev güncellenemedi");
        return;
      }

      setEditingTaskId(null);
      setEditingTitle("");
      setMessage("Görev güncellendi.");

      fetchTasks();
    } catch (error) {
      console.error(error);
      setMessage("Sunucuya bağlanılamadı");
    }
  };

  const handleStartFocus = async (taskId: number) => {
    const token = getToken();
    if (!token) return;

    try {
      const response = await fetch(
        `http://localhost:5000/focus/start/${taskId}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Odak oturumu başlatılamadı");
        return;
      }

      setFocusTaskId(taskId);
      setRemainingSeconds(data.duration);
      setMessage("25 dakikalık odak oturumu başladı.");

      fetchFocusHistory();
    } catch (error) {
      console.error(error);
      setMessage("Sunucuya bağlanılamadı");
    }
  };

  const handleStopFocus = async () => {
    const token = getToken();
    if (!token) return;

    try {
      const response = await fetch("http://localhost:5000/focus", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Odak oturumu durdurulamadı");
        return;
      }

      setFocusTaskId(null);
      setRemainingSeconds(0);
      setMessage("Odak oturumu durduruldu.");

      fetchFocusHistory();
    } catch (error) {
      console.error(error);
      setMessage("Sunucuya bağlanılamadı");
    }
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(
      2,
      "0"
    )}`;
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) {
      return `${seconds} sn`;
    }

    const minutes = Math.floor(seconds / 60);
    return `${minutes} dk`;
  };

  const todayTotalSeconds = useMemo(() => {
    const today = new Date().toDateString();

    return focusHistory.reduce((total, session) => {
      const sessionDay = new Date(session.started_at).toDateString();

      if (sessionDay === today && session.duration_seconds > 0) {
        return total + session.duration_seconds;
      }

      return total;
    }, 0);
  }, [focusHistory]);

  useEffect(() => {
    fetchTasks();
    fetchFocus();
    fetchFocusHistory();
  }, []);

  useEffect(() => {
    if (remainingSeconds <= 0) return;

    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          setFocusTaskId(null);
          fetchFocusHistory();
          return 0;
        }

        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [remainingSeconds]);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight">
            FocusTrack
          </h1>

          <p className="text-slate-600 mt-2">
            Görevlerini takip et ve odaklanmaya başla.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Toplam görev
            </p>
            <p className="text-3xl font-bold mt-1">
              {tasks.length}
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Bugünkü odak süresi
            </p>
            <p className="text-3xl font-bold mt-1">
              {formatDuration(todayTotalSeconds)}
            </p>
          </div>
        </div>

        {focusTaskId && (
          <div className="bg-slate-900 text-white rounded-2xl p-6 mb-8 shadow">
            <p className="text-sm text-slate-300 mb-1">
              Aktif odak oturumu
            </p>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-4xl font-bold tracking-wider">
                  {formatTime(remainingSeconds)}
                </p>

                <p className="text-slate-300 mt-2">
                  Görev:{" "}
                  {tasks.find((task) => task.id === focusTaskId)?.title ||
                    "Görev"}
                </p>
              </div>

              <button
                onClick={handleStopFocus}
                className="bg-white text-slate-900 px-4 py-2 rounded-xl font-medium"
              >
                Durdur
              </button>
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm mb-8">
          <h2 className="text-xl font-semibold mb-4">
            Yeni görev oluştur
          </h2>

          <form onSubmit={handleAddTask} className="flex gap-3">
            <input
              type="text"
              placeholder="Örn: Redis entegrasyonunu tamamla"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="flex-1 border border-slate-300 rounded-xl px-4 py-3"
              required
            />

            <button
              type="submit"
              className="bg-slate-900 text-white px-5 py-3 rounded-xl font-medium"
            >
              Görev Ekle
            </button>
          </form>

          {message && (
            <p className="mt-3 text-sm text-slate-600">{message}</p>
          )}
        </div>

        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">
              Görevlerim
            </h2>

            <span className="text-sm text-slate-500">
              {tasks.length} görev
            </span>
          </div>

          <div className="space-y-4">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    {editingTaskId === task.id ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) =>
                            setEditingTitle(e.target.value)
                          }
                          className="flex-1 border border-slate-300 rounded-lg px-3 py-2"
                        />

                        <button
                          onClick={() => saveEdit(task.id)}
                          className="bg-green-600 text-white px-3 py-2 rounded-lg"
                        >
                          Kaydet
                        </button>

                        <button
                          onClick={cancelEditing}
                          className="bg-slate-200 px-3 py-2 rounded-lg"
                        >
                          İptal
                        </button>
                      </div>
                    ) : (
                      <h3 className="text-lg font-semibold">
                        {task.title}
                      </h3>
                    )}
                  </div>

                  <span className="text-xs bg-slate-100 px-3 py-1 rounded-full">
                    {task.status}
                  </span>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <span className="text-sm text-slate-600">
                    Öncelik:
                  </span>

                  <select
                    value={task.priority}
                    onChange={(e) =>
                      handlePriorityChange(task.id, e.target.value)
                    }
                    className="border border-slate-300 rounded-lg px-3 py-2"
                  >
                    <option value="Low">Düşük</option>
                    <option value="Medium">Orta</option>
                    <option value="High">Yüksek</option>
                  </select>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    onClick={() => handleStartFocus(task.id)}
                    disabled={focusTaskId !== null}
                    className="bg-emerald-600 text-white px-4 py-2 rounded-lg disabled:bg-slate-300"
                  >
                    Odaklan
                  </button>

                  <button
                    onClick={() =>
                      handleStatusChange(task.id, task.status)
                    }
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg"
                  >
                    Durum Değiştir
                  </button>

                  <button
                    onClick={() => startEditing(task)}
                    className="bg-amber-500 text-white px-4 py-2 rounded-lg"
                  >
                    Düzenle
                  </button>

                  <button
                    onClick={() => handleDelete(task.id)}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg"
                  >
                    Sil
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-semibold mb-4">
            Son Odak Oturumları
          </h2>

          <div className="space-y-3">
            {focusHistory.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <p className="text-slate-500">
                  Henüz tamamlanmış bir odak oturumu yok.
                </p>
              </div>
            ) : (
              focusHistory.slice(0, 5).map((session) => (
                <div
                  key={session.id}
                  className="bg-white border border-slate-200 rounded-xl p-4 flex justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {session.task_title}
                    </p>
                    <p className="text-sm text-slate-500">
                      {new Date(session.started_at).toLocaleString("tr-TR")}
                    </p>
                  </div>

                  <span className="font-semibold">
                    {formatDuration(session.duration_seconds)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
}