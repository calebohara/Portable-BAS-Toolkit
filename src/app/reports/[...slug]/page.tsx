import ReportDetailPage from './client-page';
import EditReportPage from './edit-client-page';

export async function generateStaticParams() {
  return [{ slug: ['_'] }, { slug: ['_', 'edit'] }];
}

export default async function Page({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const id = slug[0] || '';
  const isEdit = slug[1] === 'edit';

  if (isEdit && id) {
    return <EditReportPage params={Promise.resolve({ id })} />;
  }

  return <ReportDetailPage params={Promise.resolve({ id })} />;
}
