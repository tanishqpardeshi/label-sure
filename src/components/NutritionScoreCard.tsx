import React from 'react';
import { Activity } from 'lucide-react';
import type { NutritionAssessment } from '../types/compliance';

interface NutritionScoreCardProps {
  nutrition?: NutritionAssessment;
}

export const NutritionScoreCard: React.FC<NutritionScoreCardProps> = ({ nutrition }) => {
  if (!nutrition) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 text-slate-700">
          <Activity className="h-4 w-4 text-slate-500" />
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Nutritional Compliance Engine
          </h3>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          No nutrition information table detected on this label side. Upload the back panel with
          per-100g/100ml facts to compute the Nutrition Score.
        </p>
      </section>
    );
  }

  const { score, grade, insights, profile } = nutrition;
  const gradeColor =
    grade === 'Balanced'
      ? 'text-emerald-700'
      : grade === 'Moderate'
        ? 'text-amber-700'
        : 'text-red-700';

  const rows = [
    { label: 'Energy', value: `${profile.energyKcal} kcal`, flag: profile.energyKcal > 480 },
    { label: 'Protein', value: `${profile.proteinG.toFixed(1)} g`, flag: false },
    { label: 'Total Fat', value: `${profile.totalFatG.toFixed(1)} g`, flag: profile.totalFatG > 25 },
    {
      label: 'Saturated Fat',
      value: `${profile.saturatedFatG.toFixed(1)} g`,
      flag: profile.saturatedFatG > 10,
    },
    { label: 'Trans Fat', value: `${profile.transFatG.toFixed(2)} g`, flag: profile.transFatG > 0.2 },
    {
      label: 'Added Sugar',
      value: `${profile.addedSugarG.toFixed(1)} g`,
      flag: profile.addedSugarG > 15,
    },
    { label: 'Sodium', value: `${profile.sodiumMg} mg`, flag: profile.sodiumMg > 600 },
  ];

  return (
    <section
      aria-labelledby="nutrition-card-heading"
      className="rounded-lg border border-slate-200 bg-white"
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-slate-600" />
          <h3
            id="nutrition-card-heading"
            className="font-display text-sm font-semibold text-slate-900"
          >
            Nutritional Compliance
          </h3>
        </div>
        <span className="text-xs text-slate-500">{profile.servingBasis}</span>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex items-baseline justify-between border-b border-slate-100 pb-3">
          <div>
            <span className="text-xs text-slate-500">Normalized Nutrition Score</span>
            <div className="mt-0.5 flex items-baseline gap-1.5 font-mono tabular-nums">
              <span className="text-2xl font-bold text-slate-900">{score}</span>
              <span className="text-xs text-slate-500">/ 100</span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-500">Profile Rating</span>
            <p className={`mt-0.5 text-sm font-semibold ${gradeColor}`}>{grade}</p>
          </div>
        </div>

        {/* Macro-nutrient table */}
        <div className="divide-y divide-slate-100 text-xs">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between py-1.5">
              <span className="text-slate-600">{r.label}</span>
              <span
                className={`font-mono tabular-nums font-medium ${
                  r.flag ? 'text-amber-700' : 'text-slate-900'
                }`}
              >
                {r.value}
              </span>
            </div>
          ))}
        </div>

        {/* Health Insights */}
        <div className="border-t border-slate-100 pt-3">
          <p className="text-xs font-semibold text-slate-700">Consumer Health Insights</p>
          <ul className="mt-1.5 space-y-1 text-xs text-slate-600 leading-relaxed">
            {insights.map((insight, idx) => (
              <li key={idx}>• {insight}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};
