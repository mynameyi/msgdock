import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';

export default function SwaggerReference({ spec }: { spec: Record<string, unknown> }) {
  // Swagger supports validatorUrl; the upstream React type package omits it.
  return (
    <SwaggerUI
      {...{ validatorUrl: null }}
      spec={spec}
      deepLinking
      persistAuthorization={false}
      withCredentials={false}
      tryItOutEnabled={false}
      defaultModelsExpandDepth={-1}
      displayRequestDuration
      requestInterceptor={(request) => {
        const url = new URL(request.url, window.location.origin);
        if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/v1/'))
          throw new Error('仅允许调试当前实例的通知 API');
        request.credentials = 'omit';
        return request;
      }}
    />
  );
}
