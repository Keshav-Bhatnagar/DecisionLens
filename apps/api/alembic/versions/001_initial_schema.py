"""Initial schema setup

Revision ID: 001_initial_schema
Revises: 
Create Date: 2026-10-15 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. users table
    op.create_table(
        'users',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('email', sa.String(length=255), nullable=False, unique=True),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('full_name', sa.String(length=255), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='1', nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)

    # 2. folders table
    op.create_table(
        'folders',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('parent_id', sa.String(length=36), sa.ForeignKey('folders.id', ondelete='CASCADE'), nullable=True),
        sa.Column('user_id', sa.String(length=36), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_folders_name', 'folders', ['name'])

    # 3. sessions table
    op.create_table(
        'sessions',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('objective', sa.Text(), nullable=False),
        sa.Column('folder_id', sa.String(length=36), sa.ForeignKey('folders.id', ondelete='SET NULL'), nullable=True),
        sa.Column('user_id', sa.String(length=36), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('status', sa.String(length=50), server_default='draft', nullable=False),
        sa.Column('framework_type', sa.String(length=50), server_default='mcda', nullable=False),
        sa.Column('context_data', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_sessions_title', 'sessions', ['title'])

    # 4. media table
    op.create_table(
        'media',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('session_id', sa.String(length=36), sa.ForeignKey('sessions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('file_name', sa.String(length=255), nullable=False),
        sa.Column('file_path', sa.String(length=1024), nullable=False),
        sa.Column('file_size_bytes', sa.Integer(), nullable=False),
        sa.Column('mime_type', sa.String(length=100), nullable=False),
        sa.Column('duration_seconds', sa.Float(), nullable=True),
        sa.Column('status', sa.String(length=50), server_default='uploaded', nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )

    # 5. transcripts table
    op.create_table(
        'transcripts',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('session_id', sa.String(length=36), sa.ForeignKey('sessions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('media_id', sa.String(length=36), sa.ForeignKey('media.id', ondelete='SET NULL'), nullable=True),
        sa.Column('raw_text', sa.Text(), nullable=False),
        sa.Column('segments', sa.JSON(), nullable=True),
        sa.Column('word_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )

    # 6. responses table
    op.create_table(
        'responses',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('session_id', sa.String(length=36), sa.ForeignKey('sessions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('prompt_id', sa.String(length=100), nullable=True),
        sa.Column('question', sa.Text(), nullable=False),
        sa.Column('answer', sa.Text(), nullable=False),
        sa.Column('speaker', sa.String(length=100), nullable=True),
        sa.Column('extra_metadata', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )

    # 7. analyses table
    op.create_table(
        'analyses',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('session_id', sa.String(length=36), sa.ForeignKey('sessions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('framework', sa.String(length=50), nullable=False),
        sa.Column('summary', sa.Text(), nullable=False),
        sa.Column('key_findings', sa.JSON(), nullable=True),
        sa.Column('matrix', sa.JSON(), nullable=True),
        sa.Column('recommendations', sa.JSON(), nullable=True),
        sa.Column('confidence_score', sa.Float(), server_default='0.85', nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )

    # 8. _health_heartbeat table
    op.create_table(
        '_health_heartbeat',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('ping_token', sa.String(length=100), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
    )


def downgrade() -> None:
    op.drop_table('_health_heartbeat')
    op.drop_table('analyses')
    op.drop_table('responses')
    op.drop_table('transcripts')
    op.drop_table('media')
    op.drop_index('ix_sessions_title', table_name='sessions')
    op.drop_table('sessions')
    op.drop_index('ix_folders_name', table_name='folders')
    op.drop_table('folders')
    op.drop_index('ix_users_email', table_name='users')
    op.drop_table('users')
