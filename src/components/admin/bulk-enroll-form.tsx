"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { enrollUsers } from "@/lib/actions/enrollments";

type Employee = { id: string; name: string; email: string; department?: { name: string } | null };
type Course = { id: string; title: string };

export function BulkEnrollForm({ employees, courses }: { employees: Employee[]; courses: Course[] }) {
  const [courseId, setCourseId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mandatory, setMandatory] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);
  const router = useRouter();

  const filtered = employees.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.email.toLowerCase().includes(search.toLowerCase())
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((e) => e.id)));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId || selected.size === 0) {
      setResult({ ok: false, error: "Selecione um curso e ao menos um funcionário." });
      return;
    }
    startTransition(async () => {
      const res = await enrollUsers({
        courseId,
        userIds: Array.from(selected),
        mandatory,
        dueDate: dueDate || undefined,
      });
      setResult(res);
      if (res.ok) {
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {result && !result.ok && <Alert tone="danger">{result.error}</Alert>}
      {result?.ok && result.message && <Alert tone="success">{result.message}</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-1">
          <label className="text-sm font-medium text-navy-900">Curso</label>
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
          >
            <option value="">Selecione um curso...</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-navy-900">Prazo (opcional)</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
          />
        </div>
        <div className="flex items-end pb-2.5">
          <label className="flex items-center gap-2 text-sm text-navy-700">
            <input
              type="checkbox"
              checked={mandatory}
              onChange={(e) => setMandatory(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Curso obrigatório
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-navy-900">
            Funcionários ({selected.size} selecionado(s))
          </label>
          <button type="button" onClick={toggleAll} className="text-xs font-medium text-accent-600 hover:underline">
            {selected.size === filtered.length ? "Desmarcar todos" : "Selecionar todos"}
          </button>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar funcionário..."
          className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
        />
        <div className="max-h-64 overflow-y-auto rounded-xl border border-border">
          {filtered.map((emp) => (
            <label
              key={emp.id}
              className="flex cursor-pointer items-center gap-3 border-b border-border px-3.5 py-2.5 text-sm last:border-b-0 hover:bg-surface-muted"
            >
              <input
                type="checkbox"
                checked={selected.has(emp.id)}
                onChange={() => toggle(emp.id)}
                className="h-4 w-4 rounded border-border"
              />
              <span className="flex-1 text-navy-900">{emp.name}</span>
              <span className="text-xs text-navy-700/50">{emp.department?.name ?? "-"}</span>
            </label>
          ))}
          {filtered.length === 0 && (
            <p className="px-3.5 py-4 text-center text-sm text-navy-700/50">Nenhum funcionário encontrado.</p>
          )}
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Matriculando..." : "Matricular selecionados"}
      </Button>
    </form>
  );
}
