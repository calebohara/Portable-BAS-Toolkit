import ProjectDetailPage from './client-page';

export async function generateStaticParams() {
  return [{ slug: ['_'] }];
}

export default async function Page({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const id = slug[0] || '';
  return <ProjectDetailPage params={Promise.resolve({ id })} />;
}
