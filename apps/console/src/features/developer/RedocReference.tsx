import { RedocStandalone } from 'redoc';

export default function RedocReference({ spec }: { spec: Record<string, unknown> }) {
  return (
    <RedocStandalone
      spec={spec}
      options={{
        nativeScrollbars: true,
        scrollYOffset: 20,
        theme: {
          colors: { primary: { main: '#3569ef' } },
          typography: {
            fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif',
            headings: { fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif' },
          },
        },
      }}
    />
  );
}
