'use client';
import { YouTubeHelper } from '@/components/YouTubeHelper';
import { PageHeader } from '@/components/ui';

export default function NewFromYouTubePage() {
  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader title="YouTube without the hassle" subtitle="Penlight reads captions in your own browser when YouTube won’t talk to a web server." />
      <YouTubeHelper />
    </div>
  );
}
