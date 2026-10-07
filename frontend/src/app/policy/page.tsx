"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
    <div className="flex-1 flex overflow-hidden">
      {/* Left rail: family switch + variant list */}
      <aside className="w-64 flex-shrink-0 bg-[#0d1117] border-r border-gray-800 overflow-y-auto">
        <div className="p-3 border-b border-gray-800">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
            Policy family
          </div>
          <div className="flex gap-1">
            <FamilyBtn
              active={family === "arterial"}
              onClick={() => setFamily("arterial")}
              label="Arterial"
              hint="3x2 grid actuated controller"
            />
            <FamilyBtn
              active={family === "highway"}
              onClick={() => setFamily("highway")}
              label="Highway"
              hint="ALINEA ramp metering"
            />
          </div>
        </div>
        <VariantList
          variants={familyVariants}
          selectedName={selectedName}
          activeName={activeName}
          onSelect={selectVariant}
          onNew={() => selectVariant("")}
        />
      </aside>

      {/* Main area: tabbed */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-gray-800">
          <div className="flex gap-1">
            {(["editor", "performance", "compare", "suggest"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-xs rounded transition-colors capitalize ${
                  tab === t
                    ? "bg-[#1e3a5f] border border-blue-600 text-blue-200"
                    : "text-gray-500 hover:text-gray-300 border border-transparent"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          {activeName && (
            <div className="text-[11px] text-gray-500">
              Active variant on dashboard:{" "}
              <span className="text-blue-400 font-mono">{activeName}</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="text-xs text-red-400 mb-3">{error}</div>
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
  active, onClick, label, hint,
}: { active: boolean; onClick: () => void; label: string; hint: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={`flex-1 text-[11px] py-1 rounded border transition-colors ${
        active
          ? "bg-blue-700/40 border-blue-600 text-blue-200"
          : "bg-gray-900 border-gray-800 text-gray-400 hover:text-gray-200"
      }`}
    >
      {label}
    </button>
  );
}
