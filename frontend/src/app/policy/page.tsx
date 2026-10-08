"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTrafficStore } from "@/store/trafficStore";
import { Sliders, BarChart2, GitCompare, Sparkles, Layers, Activity } from "lucide-react";
import { api } from "@/lib/api";
import {
  ARTERIAL_PARAM_FIELDS,
  DEFAULT_ALINEA_PARAMS,
  DEFAULT_POLICY_PARAMS,
  HIGHWAY_PARAM_FIELDS,
  type PolicyFamily,
  type PolicyVariant,
} from "@/lib/types";
import VariantList from "@/components/Policy/VariantList";
import VariantEditor from "@/components/Policy/VariantEditor";
import VariantPerformance from "@/components/Policy/VariantPerformance";
import VariantCompare from "@/components/Policy/VariantCompare";
import PolicySuggester from "@/components/Policy/PolicySuggester";

type Tab = "editor" | "performance" | "compare" | "suggest";

const ACTIVE_KEY = "traffic.activeVariantName";

// Per-family schema bundle — fields, defaults, and a friendly label.
function schemaFor(family: PolicyFamily) {
  if (family === "highway") {
    return {
      fields: HIGHWAY_PARAM_FIELDS,
      defaults: DEFAULT_ALINEA_PARAMS as unknown as Record<string, number>,
      label: "Highway · ALINEA",
    };
  }
  return {
    fields: ARTERIAL_PARAM_FIELDS,
    defaults: DEFAULT_POLICY_PARAMS as unknown as Record<string, number>,
    label: "Arterial · Actuated",
  };
}

export default function PolicyPage() {
  const themeMode = useTrafficStore((s) => s.themeMode);
  const isDay = themeMode === "day";
  const [family, setFamily] = useState<PolicyFamily>("arterial");
  const [variants, setVariants] = useState<PolicyVariant[]>([]);
  const [selectedName, setSelectedName] = useState<string>("");
  const [draftParams, setDraftParams] = useState<Record<string, number>>(
    DEFAULT_POLICY_PARAMS as unknown as Record<string, number>,
  );
  const [draftDescription, setDraftDescription] = useState<string>("");
  const [activeName, setActiveName] = useState<string>("");
  const [tab, setTab] = useState<Tab>("editor");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const schema = useMemo(() => schemaFor(family), [family]);

  const refreshVariants = useCallback(async () => {
    try {
      const list = (await api.listPolicyVariants()) as PolicyVariant[];
      setVariants(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load variants");
    }
  }, []);

  useEffect(() => {
    refreshVariants();
    if (typeof window !== "undefined") {
      setActiveName(localStorage.getItem(ACTIVE_KEY) ?? "");
    }
  }, [refreshVariants]);

  // When the family changes, reset selection + draft to that family's
  // defaults. Otherwise we'd render arterial fields against highway values.
  useEffect(() => {
    setSelectedName("");
    setDraftParams({ ...schema.defaults });
    setDraftDescription("");
  }, [family, schema.defaults]);

  // Only show variants from the active family in the sidebar + tabs.
  const familyVariants = useMemo(
    () => variants.filter((v) => (v.family ?? "arterial") === family),
    [variants, family],
  );

  const selectVariant = (name: string) => {
    setSelectedName(name);
    if (!name) {
      setDraftParams({ ...schema.defaults });
      setDraftDescription("");
      return;
    }
    const v = familyVariants.find((x) => x.name === name);
    if (v) {
      setDraftParams(v.params as Record<string, number>);
      setDraftDescription(v.description ?? "");
    }
  };

  const saveVariant = async (name: string, description: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required");
      return;
    }
    setLoading(true);
    try {
      await api.savePolicyVariant({
        name: trimmed,
        params: draftParams,
        family,
        description,
      });
      await refreshVariants();
      setSelectedName(trimmed);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setLoading(false);
    }
  };

  const deleteVariant = async (name: string) => {
    if (!window.confirm(`Delete variant "${name}"?`)) return;
    setLoading(true);
    try {
      await api.deletePolicyVariant(name);
      if (activeName === name) {
        localStorage.removeItem(ACTIVE_KEY);
        setActiveName("");
      }
      await refreshVariants();
      if (selectedName === name) selectVariant("");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setLoading(false);
    }
  };

  const setActive = (name: string) => {
    if (name) localStorage.setItem(ACTIVE_KEY, name);
    else      localStorage.removeItem(ACTIVE_KEY);
    setActiveName(name);
  };

  const selectedVariant: PolicyVariant | null = useMemo(() => {
    if (!selectedName) return null;
    return familyVariants.find((v) => v.name === selectedName) ?? null;
  }, [selectedName, familyVariants]);

  return (
    <div className={`flex-1 flex overflow-hidden transition-colors ${
      isDay ? "bg-slate-100/60 text-slate-800" : "bg-[#060a0f] text-gray-100"
    }`}>
      {/* Left rail: family switch + variant list */}
      <aside className={`w-72 flex-shrink-0 border-r flex flex-col overflow-y-auto transition-colors ${
        isDay ? "bg-white/95 border-slate-200/90 shadow-xs" : "bg-[#0c1017]/95 border-gray-800/80"
      }`}>
        <div className={`p-4 border-b ${isDay ? "border-slate-100 bg-slate-50/50" : "border-gray-800/80 bg-gray-900/30"}`}>
          <div className={`text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5 ${
            isDay ? "text-slate-500" : "text-gray-400"
          }`}>
            <Layers className="w-3.5 h-3.5 text-blue-500" />
            <span>Policy Architecture</span>
          </div>
          <div className="flex gap-1.5">
            <FamilyBtn
              active={family === "arterial"}
              onClick={() => setFamily("arterial")}
              label="Arterial"
              hint="3×2 Urban Grid Actuated Controller"
              isDay={isDay}
            />
            <FamilyBtn
              active={family === "highway"}
              onClick={() => setFamily("highway")}
              label="Highway"
              hint="ALINEA Ramp Metering Architecture"
              isDay={isDay}
            />
          </div>
        </div>

        <div className="flex-1 p-3">
          <VariantList
            variants={familyVariants}
            selectedName={selectedName}
            activeName={activeName}
            onSelect={selectVariant}
            onNew={() => selectVariant("")}
          />
        </div>
      </aside>

      {/* Main area: tabbed */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Tab Bar */}
        <div className={`flex-shrink-0 flex items-center justify-between px-6 py-3 border-b backdrop-blur-md transition-colors ${
          isDay ? "bg-white/80 border-slate-200" : "bg-[#0c1017]/80 border-gray-800"
        }`}>
          <div className={`p-1 rounded-xl flex gap-1 border ${
            isDay ? "bg-slate-100/90 border-slate-200/80" : "bg-gray-900/80 border-gray-800"
          }`}>
            {[
              { id: "editor", label: "Parameter Tuning", icon: Sliders },
              { id: "performance", label: "Empirical Performance", icon: BarChart2 },
              { id: "compare", label: "Compare Variants", icon: GitCompare },
              { id: "suggest", label: "AI Suggestions", icon: Sparkles },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id as Tab)}
                className={`py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  tab === id
                    ? isDay
                      ? "bg-white text-blue-600 shadow-sm border border-slate-200/60 font-bold"
                      : "bg-gray-800 text-blue-400 shadow-sm border border-gray-700 font-bold"
                    : isDay
                      ? "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                      : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {activeName && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium shadow-xs ${
              isDay ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-emerald-950/40 border-emerald-800 text-emerald-300"
            }`}>
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Active in Simulation:</span>
              <span className="font-mono font-bold">{activeName}</span>
            </div>
          )}
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className={`p-3 rounded-xl border text-xs font-medium mb-4 ${
              isDay ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-rose-950/40 border-rose-800 text-rose-300"
            }`}>
              {error}
            </div>
          )}

          {tab === "editor" && (
            <VariantEditor
              name={selectedName}
              description={draftDescription}
              params={draftParams}
              fields={schema.fields}
              familyLabel={schema.label}
              isActive={!!selectedName && activeName === selectedName}
              loading={loading}
              onParamsChange={setDraftParams}
              onDescriptionChange={setDraftDescription}
              onSave={saveVariant}
              onDelete={deleteVariant}
              onSetActive={setActive}
              onResetToDefaults={() => setDraftParams({ ...schema.defaults })}
            />
          )}

          {tab === "performance" && (
            <VariantPerformance variant={selectedVariant} />
          )}

          {tab === "compare" && (
            <VariantCompare variants={familyVariants} family={family} />
          )}

          {tab === "suggest" && (
            <PolicySuggester
              draft={draftParams}
              family={family}
              onApply={(field, value) =>
                setDraftParams({ ...draftParams, [field]: value })
              }
            />
          )}
        </div>
      </main>
    </div>
  );
}

function FamilyBtn({
  active, onClick, label, hint, isDay,
}: { active: boolean; onClick: () => void; label: string; hint: string; isDay: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={`flex-1 text-xs py-2 px-2.5 rounded-xl border font-bold transition-all ${
        active
          ? isDay
            ? "bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-500/20"
            : "bg-blue-600 border-blue-500 text-white shadow-sm"
          : isDay
            ? "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200/80"
            : "bg-gray-900 border-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-800"
      }`}
    >
      {label}
    </button>
  );
}
