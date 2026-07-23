"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type CompanyOption = {
  id: number;
  name: string;
  company_type: string;
};

const supabase = createClient();

const typeLabels: Record<string, string> = {
  general: "General Business",
  limousine: "Limousine",
  entertainment: "Nightclub",
  food: "F&B",
  other: "Other",
};

export default function CompanySelector() {
  const router = useRouter();
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || cancelled) {
        setLoading(false);
        return;
      }

      const [
        { data: companyRows, error: companyError },
        { data: profile, error: profileError },
      ] = await Promise.all([
        supabase
          .from("companies")
          .select("id, name, company_type")
          .eq("status", "active")
          .order("name"),
        supabase
          .from("profiles")
          .select("active_company_id")
          .eq("id", user.id)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      if (companyError || profileError) {
        setError(companyError?.message || profileError?.message || "Unable to load companies.");
        setLoading(false);
        return;
      }

      const rows = (companyRows ?? []) as CompanyOption[];
      setCompanies(rows);

      const savedId = profile?.active_company_id
        ? String(profile.active_company_id)
        : "";
      const savedCompanyExists = rows.some(
        (company) => String(company.id) === savedId,
      );
      const nextId = savedCompanyExists
        ? savedId
        : rows[0]
          ? String(rows[0].id)
          : "";

      setSelectedId(nextId);
      setLoading(false);

      if (!savedCompanyExists && nextId) {
        const { error: setErrorResult } = await supabase.rpc(
          "set_active_company",
          { p_company_id: Number(nextId) },
        );
        if (!cancelled && setErrorResult) setError(setErrorResult.message);
      }
    }

    const reload = () => void load();
    void load();
    window.addEventListener("companies:changed", reload);

    return () => {
      cancelled = true;
      window.removeEventListener("companies:changed", reload);
    };
  }, []);

  async function changeCompany(value: string) {
    if (!value || value === selectedId) return;

    setSaving(true);
    setError("");

    const { error: updateError } = await supabase.rpc("set_active_company", {
      p_company_id: Number(value),
    });

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setSelectedId(value);
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="company-switcher-wrap">
      <label className="company-switcher-label" htmlFor="active-company">
        Active company
      </label>
      <select
        id="active-company"
        className="company-switcher"
        value={selectedId}
        disabled={loading || saving || companies.length === 0}
        onChange={(event) => void changeCompany(event.target.value)}
        aria-label="Select active company"
      >
        {loading ? <option value="">Loading companies...</option> : null}
        {!loading && companies.length === 0 ? (
          <option value="">No active company</option>
        ) : null}
        {companies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.name} — {typeLabels[company.company_type] ?? company.company_type}
          </option>
        ))}
      </select>
      {saving ? <span className="company-switcher-status">Saving…</span> : null}
      {error ? (
        <span className="company-switcher-error" title={error}>
          Selection error
        </span>
      ) : null}
    </div>
  );
}
