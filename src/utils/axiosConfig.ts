import axios from 'axios';

// Configure axios with default headers and interceptors to prevent 415 errors
export function configureAxios() {
  // Set default headers that should be used for all requests
  axios.defaults.headers.common['Content-Type'] = 'application/json';
  axios.defaults.headers.common['Accept'] = 'application/json';

  // Add request interceptor to ensure proper content type
  axios.interceptors.request.use(
    (config) => {
      // For POST, PUT, PATCH requests ensure JSON content type is set
      if (
        (config.method === 'post' || 
         config.method === 'put' || 
         config.method === 'patch') && 
        config.data
      ) {
        // Make sure the Content-Type header is set correctly
        config.headers = config.headers || {};
        config.headers['Content-Type'] = 'application/json';
        
        // If data is not a string (i.e., it's an object or array), stringify it
        if (config.data && typeof config.data !== 'string') {
          config.data = JSON.stringify(config.data);
        }
      }
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // Add response interceptor to handle errors
  axios.interceptors.response.use(
    (response) => {
      return response;
    },
    (error) => {
      // Log helpful error information
      if (error.response) {
        console.error('API Error Response:', {
          status: error.response.status,
          statusText: error.response.statusText,
          headers: error.response.headers,
          data: error.response.data
        });
      } else if (error.request) {
        console.error('API Request Error (No Response):', error.request);
      } else {
        console.error('API Error:', error.message);
      }
      return Promise.reject(error);
    }
  );
} 