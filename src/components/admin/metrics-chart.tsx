"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type MetricsData = Array<{
  timestamp: Date;
  value: number;
}>;

type Props = {
  data: MetricsData;
  title: string;
  color?: string;
  unit?: string;
  height?: number;
  maxValue?: number;
};

export const MetricsChart = ({
  data,
  title,
  color = "#3b82f6",
  unit = "%",
  height = 200,
  maxValue,
}: Props) => {
  const chartData = data.map((point) => ({
    time: new Date(point.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    value: point.value,
  }));

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h4 className="mb-4 text-sm font-medium text-gray-700">{title}</h4>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id={`color-${title}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="time"
            tick={{ fill: "#6b7280", fontSize: 11 }}
            tickLine={{ stroke: "#e5e7eb" }}
          />
          <YAxis
            tick={{ fill: "#6b7280", fontSize: 11 }}
            tickLine={{ stroke: "#e5e7eb" }}
            domain={[0, maxValue || "auto"]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "rgba(255, 255, 255, 0.95)",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              padding: "8px 12px",
            }}
            formatter={(value: unknown) => {
              const numValue = typeof value === "number" ? value : Number(value) || 0;
              return [`${numValue.toFixed(2)}${unit}`, title];
            }}
            labelStyle={{ color: "#374151", fontWeight: 600 }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#color-${title})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

