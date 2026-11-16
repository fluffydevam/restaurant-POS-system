FROM serversideup/php:8.3-fpm-nginx

ENV PHP_OPCACHE_ENABLE=1 \
    PHP_OPCACHE_VALIDATE_TIMESTAMPS=0 \
    PHP_MAX_EXECUTION_TIME=60 \
    PHP_MEMORY_LIMIT=256M

WORKDIR /var/www/html

COPY --chown=www-data:www-data composer.json composer.lock ./

RUN composer install \
    --no-dev \
    --no-interaction \
    --prefer-dist \
    --no-scripts \
    --no-autoloader

COPY --chown=www-data:www-data . .

RUN composer dump-autoload --optimize --no-dev --no-scripts \
    && mkdir -p \
        storage/framework/cache/data \
        storage/framework/sessions \
        storage/framework/views \
        storage/logs \
        bootstrap/cache

EXPOSE 8080
