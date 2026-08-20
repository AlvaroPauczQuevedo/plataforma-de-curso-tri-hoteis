"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

export function StatusPieChart({
  data,
}: {
  data: { name: string; value: number; color: string }[];
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-ink-700/50">
        Sem matrículas registradas ainda.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={224}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={80}
          paddingAngle={3}
          isAnimationActive={false}
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e7e3df", fontSize: 13 }} />
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          formatter={(value) => <span className="text-xs text-ink-700">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function DepartmentBarChart({ data }: { data: { name: string; total: number }[] }) {
  if (data.every((d) => d.total === 0)) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-ink-700/50">
        Nenhum funcionário cadastrado ainda.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={224}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e7e3df" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} stroke="#a8a29e" />
        <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12 }} stroke="#a8a29e" />
        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e7e3df", fontSize: 13 }} />
        <Bar dataKey="total" fill="#ff6a00" radius={[0, 6, 6, 0]} barSize={16} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
