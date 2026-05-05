package com.example;

public class DuplicateCaller {
    private Repository repository;

    public void processOrder(String id) {
        repository.save(id);
        repository.save(id);  // same callee called twice — should deduplicate to 1 edge
    }
}
