'use client';
import { use } from 'react';
import { DeckManager } from '@/components/DeckManager';
import { ButtonLink } from '@/components/ui';
import { ArrowLeft } from 'lucide-react';
export default function DeckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const deckId = decodeURIComponent(id);
  return (<div><ButtonLink href="/library" variant="ghost" size="sm" className="mb-4 -ml-2"><ArrowLeft size={16} aria-hidden /> Library</ButtonLink><h1 className="text-3xl font-extrabold mb-6">Deck</h1><DeckManager deckId={deckId} /></div>);
}
