from rest_framework import serializers

from .models import Post


class PostSerializer(serializers.ModelSerializer):
    class Meta:
        model = Post
        fields = [
            'slug',
            'title',
            'category',
            'body',
            'published_at',
            'like_count',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['like_count', 'created_at', 'updated_at']
