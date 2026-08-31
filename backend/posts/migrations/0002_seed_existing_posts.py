from django.db import migrations

POSTS = [
    {
        'slug': 'post-1',
        'title': '1번 포스트',
        'category': '개발',
        'published_at': '2026-08-20',
        'body': '천만번 더들어도 기분 좋은말\n\n"사랑해~~"',
    },
    {
        'slug': 'post-2',
        'title': '2번 포스트',
        'category': '웹 기초',
        'published_at': '2026-08-18',
        'body': '안녕하세요원이입니다잘부탁드립니다.',
    },
    {
        'slug': 'post-3',
        'title': '3번 포스트',
        'category': '자동화',
        'published_at': '2026-08-15',
        'body': '돈벌어취직해사업해걍망해대출해파산해인생끝',
    },
]


def seed_posts(apps, schema_editor):
    Post = apps.get_model('posts', 'Post')
    for data in POSTS:
        Post.objects.update_or_create(slug=data['slug'], defaults=data)


def remove_posts(apps, schema_editor):
    Post = apps.get_model('posts', 'Post')
    Post.objects.filter(slug__in=[p['slug'] for p in POSTS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('posts', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_posts, remove_posts),
    ]
