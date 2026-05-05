package com.example;

public class Repository {
    private Util util;

    public void save(String id) {
        if (id != null) {
            util.format(id);
        }
    }

    public void delete(String id) {
        if (id != null) {
            util.format(id);
        }
    }
}
