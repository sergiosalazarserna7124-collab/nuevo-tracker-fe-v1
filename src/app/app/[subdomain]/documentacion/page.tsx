"use client";

import PageHeader from "@/components/dashboard/PageHeader";
import DocumentacionContent from "@/components/dashboard/DocumentacionContent";

export default function DocumentacionPage() {
  return (
    <>
      <PageHeader
        title="Documentación"
        subtitle="Qué hace el sistema: etiquetas, notas, tareas y cómo procesa llamadas, chats y citas"
      />
      <div className="p-3 md:p-4 mx-auto max-w-4xl">
        <DocumentacionContent />
      </div>
    </>
  );
}
