import {Suspense} from "react";
import PrintDocument from "@/components/print-document";
export default function Page(){return <Suspense fallback={<main className="document-state">Preparing document...</main>}><PrintDocument kind="payout"/></Suspense>}
